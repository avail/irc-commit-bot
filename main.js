// requires
const irc = require("irc");
const express = require("express");
const log4js = require("log4js");
const body_parser = require("body-parser");
const util = require("util");
const isgd = require('isgd');
const nconf = require('nconf');

const logger = log4js.getLogger();
logger.info("bot starting...");

// load configuration from nconf
nconf.argv().env().file('config.json').defaults({
    // irc
    channels: ["#availtesting"],
    server: "irc.rizon.net",
    bot_name: "nyanners",
    bot_pass: "",
    bot_registered: false, // is the bot registered? (true or false)
    bot_vhost: false, // does the bot have a VHost assigned?
    bot_user: "nyan",
    bot_real: "Avail's Gitlab hook bot",

    // git listen port
    port: 4021    
});

// make sure the channel list is an array
const channels = nconf.get('channels');

if (!Array.isArray(channels)) {
    channels = [ channels ];
}

const bot = new irc.Client(nconf.get('server'), nconf.get('bot_name'), {
    userName: nconf.get('bot_user'),
    realName: nconf.get('bot_real'),
    encoding: "utf-8"
});

bot.addListener("error", function(message) {
    logger.info("irc died: ", message);
});

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

                        logger.info("We join");

                    }

                }

            }

            if (raw["nick"] == "HostServ") {

                if (raw["args"][1].indexOf("activated") > -1) {

                    for (channel of channels) {
                        bot.join(channel);
                    }

                    logger.info("We join");

                }

            }

        });

} else {

    bot.addListener('registered', function() {
        for (channel of channels) {
            bot.join(channel);
        }

        logger.info("We join");
    });

}

const app = express();
const jp = body_parser.json()

app.get("/", function(req, res){
    res.send("ww");
});

app.post("/git.json", jp, function (req, res) {

    logger.info("*pacman ghost sounds*");
    if (!req.body) return res.sendStatus(400)

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
                var branch = req.body["ref"].split("/")[2];
                var commit_name = "name";

            } else if (req.headers["x-github-event"]) {

                var service = "Github";
                var repository_url = req.body["repository"]["html_url"];
                var repository_name = req.body["repository"]["name"];
                var user_name = req.body["pusher"]["name"];
                var commits_count = req.body["commits"].length;
                var branch = req.body["ref"].split("/")[2];
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

            for (var commit of req.body["commits"]) {

                var reply_commits = util.format("\t\x02\x0306～\x03 %s\x02: %s (\x02%s\x02)",
                    commit["id"].substring(0, 7),
                    commit["message"].replace(/[\r\n]/g, "").replace(/[\n]/g, ""),
                    commit["author"][commit_name]);

                for (var channel of channels) {
                    bot.say(channel, reply_commits);
                }

            }

            for (var channel of channels) {
                bot.say(channel, "View more at " + repository_url);
            }

            logger.info(service + ": [" + repository_name + "/" + branch + "] "+ user_name + " pushed " + commits_count + " new commit(s)");

        // ---------------------------------------------- \\
        //                                                \\
        //                  ISSUE HOOK                    \\
        //                                                \\
        // ---------------------------------------------- \\
    } else if (req.headers["x-gitlab-event"] == "Issue Hook" || req.headers["x-github-event"] == "issues") {

        if (req.headers["x-gitlab-event"] != null) {

            if(req.body["object_attributes"]["action"] == "update") return res.sendStatus(400);

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

            }

            var service = "Github";
            var issue_id = req.body["issue"]["number"];
            var issue_title = req.body["issue"]["title"];
            var issue_user = req.body["issue"]["user"]["login"];
            var issue_url = req.body["issue"]["html_url"];

        }

        for (var channel of channels) {

            bot.say(channel, util.format("\x02\x0306Issue\x03\x02: \x02#%d\x02 \x02\x0303%s\x03\x02 - %s%s - %s",
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

        isgd.shorten(req.body["comment"]["html_url"], function(resp) {
            for (var channel of channels) {
                bot.say(channel, util.format("\x02\x0306Comment\x03\x02: %s commented on a commit - %s",
                    req.body["comment"]["user"]["login"],
                    resp));
            }
        });

        logger.info("Github: commit comment by " + req.body["comment"]["user"]["login"]);

    } else if (req.headers["x-github-event"] == "issue_comment") {

        var split_url = req.body["issue"]["html_url"].split('/');
        if (split_url[split_url.length - 2] == "issues") { // if it's an issue

            isgd.shorten(req.body["issue"]["html_url"], function(resp) {

                for (var channel of channels) {

                    bot.say(channel, util.format("\x02\x0306Comment\x03\x02: %s commented on issue \"%s\" - %s",
                        req.body["issue"]["user"]["login"],
                        "\x02\x0303" + req.body["issue"]["title"] + "\x03\x02".replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                        resp));

                }

            });

            logger.info("Github: issue comment by " + req.body["issue"]["user"]["login"]);

        } else { // otherwise it's a pull request

            isgd.shorten(req.body["issue"]["html_url"], function(resp) {
                for (var channel of channels) {
                    bot.say(channel, util.format("\x02\x0306Comment\x03\x02: %s commented on pull request \"%s\" - %s",
                        req.body["issue"]["user"]["login"],
                        "\x02\x0303" + req.body["issue"]["title"] + "\x03\x02".replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                        resp));
                }
            });

            logger.info("Github: pull request comment by " + req.body["issue"]["user"]["login"]);

        }

        // ---------------------------------------------- \\
        //                                                \\
        //               MERGE REQUEST HOOK               \\
        //                                                \\
        // ---------------------------------------------- \\
    } else if (req.headers["x-gitlab-event"] == "Merge Request Hook" || req.headers["x-github-event"] == "pull_request") {

        if (req.headers["x-gitlab-event"] != null) {

            switch(req.body["object_attributes"]["state"].toLowerCase()) {
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

            switch(req.body["action"].toLowerCase()) {
                case "opened":
                var type = "Opened";
                break;

                case "closed":
                var type = "Closed";
                break;

                case "reopened":
                var type = "Reopened";
                break;
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

            isgd.shorten(merge_url, function(resp) {

                for (var channel of channels) {

                    bot.say(channel, util.format("\x02\x0306Merge request\x03\x02: \x02#%d\x02 \x02\x0303%s\x03\x02 - %s by %s - %s",
                        merge_id,
                        merge_title,
                        type,
                        merge_user,
                        resp));
                }

            });

        }

        logger.info("Merge Request");
    }

    res.sendStatus(200);
    res.end();
})

app.listen(nconf.get('port'));
logger.info("listening on port " + nconf.get('port'));
