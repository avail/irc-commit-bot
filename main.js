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

    if (from == "Global" && authed == false) { // assume we're completely connected
        bot.say("nickserv", "identify " + config.bot_pass); // we identify to nickserv
        logger.info("We auth");
        bot.say("hostserv", "on");
        logger.info("We vhost");
        authed = true;
    }

    if (from == "HostServ") {
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

        if (req.headers["x-gitlab-event"] == "Push Hook") {

            var reply = util.format("\x02\x0306Commit\x03\x02: \x02\x0303%s\x03\x02 - %s pushed %d new commit%s to branch \x02%s\x02:",
                req.body["repository"]["name"],
                req.body["user_name"],
                req.body["total_commits_count"],
                req.body["total_commits_count"] == 1 ? "" : "s",
                req.body["ref"].split("/")[2]);

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
                bot.say(channel, "View more at " + req.body["repository"]["homepage"]);
            }

            logger.info("Push Hook");

        } else if (req.headers["x-gitlab-event"] == "Issue Hook") {

            var type = "";
            switch(req.body["object_attributes"]["action"].toLowerCase()) {
                case "open":
                type = "Issue opened by ";
                break;

                case "close":
                type = "Issue closed by ";
                break;

                case "reopen":
                type = "Issue reopened by ";
                break;
            }

            if (req.body["object_attributes"]["action"] != "update") {

                for (var channel of config.channels) {
                    bot.say(channel, util.format("\x02\x0306Issue\x03\x02: \x02#%d\x02 \x02\x0303%s\x03\x02 - %s%s - %s",
                        req.body["object_attributes"]["iid"],
                        req.body["object_attributes"]["title"],
                        type,
                        req.body["user"]["name"],
                        req.body["object_attributes"]["url"]));
                }

            }

            logger.info("Issue Hook");

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

        } else if (req.headers["x-gitlab-event"] == "Merge Request Hook") {

            var type = "";
            switch(req.body["object_attributes"]["state"].toLowerCase()) {
                case "opened":
                type = "Opened";
                break;

                case "merged":
                type = "Merged";
                break;

                case "closed":
                type = "Closed";
                break;

                case "reopened":
                type = "Reopened";
                break;
            }

            if (req.body["object_attributes"]["action"] == "open" || req.body["object_attributes"]["action"] == "close" || req.body["object_attributes"]["action"] == "reopen") {
                isgd.shorten(req.body["object_attributes"]["url"], function(resp) {
                    for (var channel of config.channels) {
                        bot.say(channel, util.format("\x02\x0306Merge request\x03\x02: \x02#%d\x02 \x02\x0303%s\x03\x02 - %s by %s - %s",
                            req.body["object_attributes"]["iid"],
                            req.body["object_attributes"]["title"],
                            type,
                            req.body["user"]["name"],
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