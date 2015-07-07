// requires
var irc = require("irc");
var express = require("express");
var log4js = require("log4js");
var io = require("socket.io");
var body_parser = require("body-parser");
var util = require("util");
var isgd = require('isgd');

var logger = log4js.getLogger();
logger.info("ciSV starting...");

// configuration
var config = {
    // irc
    channels: ["#6c37"],
    server: "irc.freenode.net",
    bot_name: "nyawu",
    bot_pass: "",
    bot_user: "nyan",
    bot_real: "Avail's Gitlab hook bot",

    // git listen port
    port: 4021
};

var bot = new irc.Client(config.server, config.bot_name, {
    userName: config.bot_user,
    realName: config.bot_real,
    encoding: "utf-8"
});

bot.addListener("error", function(message) {
    logger.info("irc died: ", message);
});

var authed = false;
bot.addListener("notice", function (from, message) {

    if (from == "NickServ" && authed == false) {
        bot.say("nickserv", "identify " + config.bot_pass);
        logger.info("We auth");
        //bot.say("hostserv", "on");
        //logger.info("We vhost");
        authed = true;

        for (channel of config.channels) {
            bot.join(channel);
        }
        logger.info("We join");
    }

});

var app = express();
var jp = body_parser.json()

app.get("/", function(req, res){
    res.send("ww");
});

app.post("/git.json", jp, function (req, res) {

    logger.info("*pacman ghost sounds*");
    if (!req.body) return res.sendStatus(400)

        if (req.headers["x-gitlab-event"] == "Push Hook" || req.headers["x-github-event"] == "push") {

            if (req.headers["x-gitlab-event"] != null) {

                var repository_url = req.body["repository"]["homepage"];
                var repository_name = req.body["repository"]["name"];
                var user_name = req.body["user_name"];
                var commits_count = req.body["total_commits_count"];
                var branch = req.body["ref"].split("/")[2];

            } else if (req.headers["x-github-event"]) {

                var repository_url = req.body["repository"]["html_url"];
                var repository_name = req.body["repository"]["name"];
                var user_name = req.body["pusher"]["name"];
                var commits_count = req.body["commits"].length;
                var branch = req.body["ref"].split("/")[2];

            }

            var reply = util.format("\x02\x0306Commit\x03\x02: \x02\x0303%s\x03\x02 - %s pushed %d new commit%s to branch \x02%s\x02:",
                repository_name,
                user_name,
                commits_count,
                commits_count == 1 ? "" : "s",
                branch);

            for (var channel of config.channels) {
                bot.say(channel, reply);
            }

            for (var commit of req.body["commits"]) {
                var reply_commits = util.format("\t\x02\x0306～\x03 %s\x02: %s (\x02%s\x02)",
                    commit["id"].substring(0, 7),
                    commit["message"].replace(/[\r\n]/g, "").replace(/[\n]/g, ""),
                    commit["author"]["name"]);

                for (var channel of config.channels) {
                    bot.say(channel, reply_commits);
                }
            }

            for (var channel of config.channels) {
                bot.say(channel, "View more at " + repository_url);
            }

            logger.info("Push Hook");

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

                var issue_id = req.body["issue"]["number"];
                var issue_title = req.body["issue"]["title"];
                var issue_user = req.body["issue"]["user"]["login"];
                var issue_url = req.body["issue"]["html_url"];

            }

            for (var channel of config.channels) {
                bot.say(channel, util.format("\x02\x0306Issue\x03\x02: \x02#%d\x02 \x02\x0303%s\x03\x02 - %s%s - %s",
                    issue_id,
                    issue_title,
                    type,
                    issue_user,
                    issue_url));
            }

            logger.info("Issue Hook");

            // TODO: Implement Github for comments, there's a lot of stuff to be modified here
        } else if (req.headers["x-gitlab-event"] == "Note Hook") {

            var type = "";
            switch(req.body["object_attributes"]["noteable_type"].toLowerCase()) {
                case "commit":
                type = "commit \x02\x0303" + req.body["commit"]["message"] + "\x03\x02";
                break;

                case "mergerequest":
                type = "merge request \x02\x0303" + req.body["merge_request"]["title"] + "\x03\x02";
                break;

                case "issue":
                type = "issue \x02\x0303" + req.body["issue"]["title"] + "\x03\x02";
                break;

                case "snippet":
                type = "snippet \x02\x0303" + req.body["snippet"]["title"] + "\x03\x02";
                break;

            }

            isgd.shorten(req.body["object_attributes"]["url"], function(resp) {
                for (var channel of config.channels) {
                    bot.say(channel, util.format("\x02\x0306Comment\x03\x02: %s commented on %s - %s",
                        req.body["user"]["name"],
                        type.replace(/[\r\n]/g, " - ").replace(/[\n]/g, " - "),
                        resp));
                }
            });

            logger.info("Note Hook");

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
                    for (var channel of config.channels) {
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

var nserver = require("http").createServer(app), io = io.listen(nserver, { log: false });

io.sockets.on("connection", function(socket)
{
    var conn = new ClientConnection(server.instance);

    conn.on("message", function(cn, message)
    {
        server.instance.handleMessage(cn, message);
    });

    conn.on("closed", function()
    {
        server.deleteConnection(conn);
    });

    conn.bindToWeb(socket);
});

nserver.listen(config.port);
logger.info("listening on port " + config.port);