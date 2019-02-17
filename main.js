// requires
const irc = require("irc");
const express = require("express");
const log4js = require("log4js");
const body_parser = require("body-parser");
const util = require("util");
const isgd = require('isgd');
const nconf = require('nconf');
const sha1 = require('js-sha1');

const logger = log4js.getLogger();
logger.info("bot starting...");

// load configuration from nconf
nconf.argv().env().file('config.json').defaults({
    // irc
    channels: ["#githookbottest"],
    server: "chat.freenode.net",
    bot_name: "GitHookBot" + Math.floor(1000 + Math.random() * 9000), 
    bot_pass: "",
    bot_registered: false, // is the bot registered? (true or false)
    bot_vhost: false, // does the bot have a VHost assigned?
    bot_user: "GitHookBot",
    bot_real: "Git Hook Bot",

    // git listen port
    port: 4021
});

// allow integrarion with third-party port services
if (process.env.PORT) {
    nconf.set('port', process.env.PORT);
	logger.info(nconf.get('port'));
}

// make sure the channel list is an array
var channels_conf = nconf.get('channels');

if (!Array.isArray(channels_conf)) {
    channels_conf = [ channels_conf ];
}

var channels = [];

for (var channel of channels_conf) {
    channels.push(channel[0] != '#' ? ('#' + channel) : channel);
}

logger.info("new irc client");
const bot = new irc.Client(nconf.get('server'), nconf.get('bot_name'), {	
    userName: nconf.get('bot_user'),
    realName: nconf.get('bot_real'),
    encoding: "utf-8"
});

bot.addListener("error", function(message) {
    logger.info("irc died: ", message);
	
	// try and rejoin all channels	
	for (channel of channels) {
            bot.join(channel);
        }

        doJoin();
});

var joinCallbacks = [];
var botJoined = false;

if (nconf.get('bot_registered') == true) {

    bot.addListener('raw', function(message) {

        raw = message;
        if (raw["nick"] == "NickServ") {

            if (raw["args"][1].toLowerCase().indexOf("identify") > -1) {

                bot.say("nickserv", "identify " + nconf.get('bot_pass'));
                logger.info("Nickserv: identify *pass*");

            }

            if (raw["args"][1].indexOf("incorrect") > -1) {

                logger.info("NickServ: Incorrect password :(");
                    process.exit();

                }

                if (raw["args"][1].toLowerCase().indexOf("identified") > -1 || raw["args"][1].toLowerCase().indexOf("recognized") > -1) {

                    if (nconf.get('bot_vhost') == true) {

                        bot.say("hostserv", "on");
                        logger.info("HostServ: on");

                    } else {

                        for (channel of channels) {
                            bot.join(channel);
                        }

                        doJoin();

                        logger.info("We join");

                    }

                }

            }

            if (raw["nick"] == "HostServ") {

                if (raw["args"][1].indexOf("activated") > -1) {

                    for (channel of channels) {
                        bot.join(channel);
                    }

                    doJoin();

                    logger.info("We join");

                }

            }

        });

} else {

    bot.addListener('registered', function() {
        for (channel of channels) {
            bot.join(channel);
        }

        doJoin();

        logger.info("We join");
    });

}

function doJoin() {
    botJoined = true;
	logger.info("doJoin()");
    for (var cb of joinCallbacks) {
        cb();
    }

    joinCallbacks = [];
}

const app = express();
const jp = body_parser.json()

app.get("/", function(req, res){
    res.send("ww");
});

app.post("/git.json", jp, function (req, res) {
	
    logger.info("Incoming POST");
	//logger.info(req);
	
	if (!req.body) return res.sendStatus(400)

    if (botJoined) {
		logger.info("Calling handleAPI - bot already joined");
        handleAPI(req, res);
    } else {
		logger.info("Doing callbacks - bot not joined");
        joinCallbacks.push(function() {
            handleAPI(req, res);
        });	
    }

    res.sendStatus(200);
    res.end();
});


function handleAPI(req, res) {
    logger.info("*pacman ghost sounds*");

    if (req.headers["x-gitlab-event"] != null) {
        handleGitLab(req, res);
    }
    else if (req.headers["x-github-event"]) {
        handleGitHub(req, res);
    }

        // ---------------------------------------------- \\
        //                                                \\
        //                  PUSH HOOK                     \\
        //                                                \\
        // ---------------------------------------------- \\
        if (req.headers["x-gitlab-event"] == "Push Hook" || req.headers["x-github-event"] == "push") {

            if (req.headers["x-gitlab-event"] != null) {

                var service = "Gitlab";
                var repository_url = req.body["repository"]["homepage"];
                var repository_name = req.body["repository"]["name"];
                var user_name = req.body["user_name"];
                var commits_count = req.body["total_commits_count"];
                var branch = req.body["ref"].split("/").slice(2).join("/");
                var commit_name = "name";

            } else if (req.headers["x-github-event"]) {
				
				//logger.info(req.body);
                var service = "Github";
                var repository_url = req.body["repository"]["html_url"];
				var repository_owner = req.body["repository"]["owner"]["name"];
                var repository_name = req.body["repository"]["full_name"];
                var user_name = req.body["pusher"]["name"];
                var commits_count = req.body["commits"].length;
                var branch = req.body["ref"].split("/").slice(2).join("/");
                var commit_name = "username";
            }

            var reply = util.format("\x02\x0306Commit\x03\x02: \x02\x0303%s\x03\x02 - %s pushed %d new commit%s to branch \x02%s\x02:",
                repository_name,
                user_name,
                commits_count,
                commits_count == 1 ? "" : "s",
                branch);

            for (var channel of channels) {
                bot.say(channel, reply);
            }

			var commitsToShow = 3;
			var commitCnt = 0;
			var commitExtraCnt = 0;
			
			for (var commit of req.body["commits"]) {	
				if (commitCnt >= commitsToShow) {
					commitExtraCnt++;
				}
				else {
					commitCnt++;
				}					
			}
			
            for (var commit of req.body["commits"]) {
				
				commitCnt--;
				
				// we only want to show max 3 commits
				if (commitCnt >= 0) {
					
					// get shortened commit urls
					isgd.shorten(commit["url"], function(commitShorter) {
						var reply_commits = util.format("\t\x02\x0306-\x03 %s\x02: %s (\x02%s\x02) %s",
						commit["id"].substring(0, 7),
						commit["message"].replace(/[\r\n]/g, "").replace(/[\n]/g, ""),
						commit["author"][commit_name],
						commitShorter);					
						
						for (var channel of channels) {
							bot.say(channel, reply_commits);
						}
					});
				}
				else {						
					for (var channel of channels) {
						bot.say(channel, "...and " + commitExtraCnt + " more commits");
					}
				}	
            }

            for (var channel of channels) {
                //bot.say(channel, "View more at " + repository_url);
            }

            logger.info(service + ": [" + repository_name + "/" + branch + "] "+ user_name + " pushed " + commits_count + " new commit(s)");

        // ---------------------------------------------- \\
        //                                                \\
        //                  ISSUE HOOK                    \\
        //                                                \\
        // ---------------------------------------------- \\
    } else if (req.headers["x-gitlab-event"] == "Issue Hook" || req.headers["x-github-event"] == "issues") {

        if (req.headers["x-gitlab-event"] != null) {

            if(req.body["object_attributes"]["action"] == "update") return;

            switch(req.body["object_attributes"]["action"].toLowerCase()) {

                case "open":
                var type = "Issue opened by ";
                break;

                case "close":
                var type = "Issue closed by ";
                break;

                case "reopen":
                var type = "Issue reopened by ";
                break;	
            }

            var service = "Gitlab";
            var issue_id = req.body["object_attributes"]["iid"];
            var issue_title = req.body["object_attributes"]["title"];
            var issue_user = req.body["user"]["name"];
            var issue_url = req.body["object_attributes"]["url"];


        } else if (req.headers["x-github-event"]) {

            switch(req.body["action"].toLowerCase()) {

                case "opened":
                var type = "Issue opened by ";
                break;

                case "closed":
                var type = "Issue closed by ";
                break;

                case "reopened":
                var type = "Issue reopened by ";
                break;
				
				// ignore undefined things
				default:
					return;

            }

            var service = "Github";
            var issue_id = req.body["issue"]["number"];
            var issue_title = req.body["issue"]["title"];
            var issue_user = req.body["issue"]["user"]["login"];
            var issue_url = req.body["issue"]["html_url"];
			var repository_name = req.body["repository"]["full_name"];
			
			//logger.info(req.body);

        }

        for (var channel of channels) {

            bot.say(channel, util.format("\x02\x0306Issue\x03\x02: %s \x02#%d\x02 \x02\x0303%s\x03\x02 - %s%s - %s",
                repository_name,
				issue_id,
                issue_title,
                type,
                issue_user,
                issue_url));

        }

        logger.info(service + ": " + issue_user + " opened issue #" + issue_id);

        // ---------------------------------------------- \\
        //                                                \\
        //                 COMMENT HOOK                   \\
        //                                                \\
        // ---------------------------------------------- \\
    } else if (req.headers["x-gitlab-event"] == "Note Hook") {

        switch(req.body["object_attributes"]["noteable_type"].toLowerCase()) {

            case "commit":
            var type = "commit \x02\x0303" + req.body["commit"]["message"] + "\x03\x02";
            break;

            case "mergerequest":
            var type = "merge request \x02\x0303" + req.body["merge_request"]["title"] + "\x03\x02";
            break;

            case "issue":
            var type = "issue \x02\x0303" + req.body["issue"]["title"] + "\x03\x02";
            break;

            case "snippet":
            var type = "snippet \x02\x0303" + req.body["snippet"]["title"] + "\x03\x02";
            break;

        }

        isgd.shorten(req.body["object_attributes"]["url"], function(resp) {

            for (var channel of channels) {

                bot.say(channel, util.format("\x02\x0306Comment\x03\x02: %s commented on %s - %s",
                    req.body["user"]["name"],
                    type.replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                    resp));

            }

        });

        logger.info("Gitlab: " + type + " comment by " +  req.body["user"]["name"]);

    } else if (req.headers["x-github-event"] == "commit_comment") {



    } else if (req.headers["x-github-event"] == "issue_comment") {





        // ---------------------------------------------- \\
        //                                                \\
        //               MERGE REQUEST HOOK               \\
        //                                                \\
        // ---------------------------------------------- \\
    } else if (req.headers["x-gitlab-event"] == "Merge Request Hook" || req.headers["x-github-event"] == "pull_request") {

            if (req.headers["x-gitlab-event"] != null) {

                switch (req.body["object_attributes"]["state"].toLowerCase()) {
                    case "opened":
                        var type = "Opened";
                        break;

                    case "merged":
                        var type = "Merged";
                        break;

                    case "closed":
                        var type = "Closed";
                        break;

                    case "reopened":
                        var type = "Reopened";
                        break;
                }

                var action = req.body["object_attributes"]["action"];
                var merge_url = req.body["object_attributes"]["url"];
                var merge_id = req.body["object_attributes"]["iid"];
                var merge_title = req.body["object_attributes"]["title"];
                var merge_user = req.body["user"]["name"];

            } else if (req.headers["x-github-event"]) {

                switch (req.body["action"].toLowerCase()) {
                    case "opened":
                        var type = "Opened";
                        break;

                    case "closed":
                        var type = "Closed";
                        break;

                    case "reopened":
                        var type = "Reopened";
                        break;

                    // ignore undefined things
                    default:
                        return;
                }

                if (req.body["pull_request"]["merged"] == true)
                    type = "Merged";

                var action = req.body["action"];
                var merge_url = req.body["pull_request"]["html_url"];
                var merge_id = req.body["pull_request"]["number"];
                var merge_title = req.body["pull_request"]["title"];
                var merge_user = req.body["pull_request"]["user"]["login"];

            }

            if (action == "open" || action == "close" || action == "reopen" || action == "opened" || action == "closed" || action == "reopened" || type == "Merged") {
                var repository_name = req.body["repository"]["full_name"];
                //logger.info(req.body);

                var head = req.body["pull_request"]["head"]["label"];
                var base = req.body["pull_request"]["base"]["label"];


                isgd.shorten(merge_url, function (resp) {

                    for (var channel of channels) {

                        bot.say(channel, util.format("\x02\x0306Pull Request\x03\x02: %s \x02#%d\x02 \x02\x0303%s\x03\x02 (%s -> %s) - %s by %s - %s",
                            repository_name,
                            merge_id,
                            merge_title,
                            head,
                            base,
                            type,
                            merge_user,
                            resp));
                    }

                });

            }

            logger.info("Merge Request");
        }
};

// GitHub related hooks
function handleGitHub(req, res) {
    for (var channel of channels) {
        bot.say(channel, "DEBUG: " + req.headers["x-github-event"] + " : " + req.body["action"] + " : " + req.body["ref_type"] + " : " + req.body["ref"]);
    }

    // action
    var action = req.body["action"];

    // repository
    var repo_name = req.body["repository"]["name"];
    var repo_full_name = req.body["repository"]["full_name"];
    var repo_html_url = req.body["repository"]["html_url"];

    // sender
    var sender_login = req.body["sender"]["login"];

    // comments
    var comment_html_url = req.body["comment"]["html_url"];
    var comment_type = "commented on";
    if (action == "edited") {
        comment_type = "edited a comment on"
    }
    else if (action == "deleted") {
        comment_type = "deleted a comment on"
    }

    var event = req.headers["x-github-event"];

    // https://developer.github.com/v3/activity/events/types/#commitcommentevent
    if (event == "commit_comment") {
        for (var channel of channels) {
            bot.say(channel, util.format("\x02\x0306%s\x03\x02: %s %s \x02commit\x02 - %s",
                repo_full_name,
                req.body["comment"]["user"]["login"],
                comment_type,
                comment_html_url));
        }
        //logger.info("Github: commit comment by " + req.body["comment"]["user"]["login"]);
    }

    //https://developer.github.com/v3/activity/events/types/#issuecommentevent
    if (event == "issue_comment") {
        var split_url = req.body["issue"]["html_url"].split('/');
        if (split_url[split_url.length - 2] == "issues") {
            for (var channel of channels) {

                bot.say(channel, util.format("\x02\x0306%s\x03\x02: %s %s \x02issue\x02 \"%s\" - %s",
                    repo_full_name,
                    req.body["comment"]["user"]["login"],
                    comment_type,
                    "\x02\x0303" + req.body["issue"]["title"] + "\x03\x02".replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                    comment_html_url));
            }
            //logger.info("Github: issue comment by " + req.body["issue"]["user"]["login"]);
        }
        else {
            for (var channel of channels) {

                bot.say(channel, util.format("\x02\x0306%s\x03\x02: %s %s \x02PR\x02 \"%s\" - %s",
                    repo_full_name,
                    req.body["comment"]["user"]["login"],
                    comment_type,
                    "\x02\x0303" + req.body["issue"]["title"] + "\x03\x02".replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                    comment_html_url));
            }
            //logger.info("Github: issue comment by " + req.body["issue"]["user"]["login"]);
        }
    }

    // https://developer.github.com/v3/activity/events/types/#pullrequestreviewcommentevent
    if (event == "pull_request_review_comment") {
        for (var channel of channels) {
            bot.say(channel, "meh");
            bot.say(channel, util.format("\x02\x0306%s\x03\x02: %s %s pull request \"%s\" - %s",
                repo_full_name,
                req.body["sender"]["login"],
                comment_type,
                "\x02\x0303" + req.body["issue"]["title"] + "\x03\x02".replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                comment_html_url));
        }
        //logger.info("Github: pull request comment by " + req.body["sender"]["login"]);
    }

    //https://developer.github.com/v3/activity/events/types/#createevent
    if (req.headers["x-github-event"] == "create") {
        for (var channel of channels) {
            bot.say(channel, "meh");
        }

        var create_type = req.body["ref_type"];
        var ref = req.body["ref"];

        if (req.body["ref_type"] == "branch") {
            for (var channel of channels) {
                bot.say(channel, util.format("\x02\x0306%s\x03\x02: %s created new \x02branch\x02 %s - %s",
                    repo_full_name,
                    req.body["sender"]["login"],
                    ref,
                    repo_html_url + "/tree/" + ref));
            }
            //logger.info("Github: create branch by " + req.body["sender"]["login"]);
        }
        else if (create_type == "tag") {

        }
    }

    // parse possible event types
    // for now do NO url shortening
    switch (req.headers["x-github-event"]) {

        // https://developer.github.com/v3/activity/events/types/#commitcommentevent
        case "commit_comment":
            break;

        // https://developer.github.com/v3/activity/events/types/#issuecommentevent
        case "issue_comment":
            break;

        // https://developer.github.com/v3/activity/events/types/#pullrequestreviewcommentevent
        case "pull_request_review_comment":



            break;

        // https://developer.github.com/v3/activity/events/types/#createevent
        case "create":


            break;

        // https://developer.github.com/v3/activity/events/types/#deleteevent
        case "delete":
            break;

        // https://developer.github.com/v3/activity/events/types/#issuesevent
        case "issues":
            break;

        // https://developer.github.com/v3/activity/events/types/#labelevent
        case "label":
            break;

        // https://developer.github.com/v3/activity/events/types/#memberevent
        case "member":
            break;

        // https://developer.github.com/v3/activity/events/types/#membershipevent
        case "membership":
            break;

        // https://developer.github.com/v3/activity/events/types/#milestoneevent
        case "milestone":
            break;

        // https://developer.github.com/v3/activity/events/types/#organizationevent
        case "organization":
            break;

        // https://developer.github.com/v3/activity/events/types/#pullrequestevents
        case "pull_request":
            break;

        // https://developer.github.com/v3/activity/events/types/#pullrequestreviewevent
        case "pull_request_review":
            break;

        // https://developer.github.com/v3/activity/events/types/#pushevent
        case "push":
            break;

        // https://developer.github.com/v3/activity/events/types/#releaseevent
        case "release":
            break;

        // https://developer.github.com/v3/activity/events/types/#statusevent
        case "status":
            break;

        // https://developer.github.com/v3/activity/events/types/#watchevent
        case "watch":
            break;

        default:
    }

};

// GitLab related hooks
function handleGitLab(req, res) {

};

app.listen(nconf.get('port'));
logger.info("listening on port " + nconf.get('port'));
