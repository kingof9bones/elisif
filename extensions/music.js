//A built-in youtube music server for the discord bot
//Powered by Youtube, my Evergreen API, and my CannicideAPI YT Audio API
//Dependencies: LSON (EvG-Based Storage), node-fetch
var ls = require("../ls");
var Command = require("../command");
var Alias = require("../alias");
var Interface = require("../interface");
var fetch = require("node-fetch");

function Queue(message) {

    var storage = {
        starter: message.author.id,
        songs: [],
        index: 0,
        loop: false
    }

    function reloadStorage() {
        if (ls.exist(message.guild.id + "musicQueue")) {
            storage = ls.get(message.guild.id + "musicQueue");
            return storage;
        }
        else return false;
    }

    function saveStorage() {
        ls.set(message.guild.id + "musicQueue", storage);
    }

    this.get = () => {
        reloadStorage();

        return storage;
    }

    this.save = saveStorage;

    this.getSong = () => {

        reloadStorage();

        return storage.index >= storage.songs.length ? false : storage.songs[storage.index];

    }

    this.addSong = (name, id, author, msg, audio, keywords) => {

        reloadStorage();

        storage.songs.push({
            name: name,
            id: id,
            url: audio,
            artist: author,
            requester: msg.author.tag,
            keywords: keywords
        });

        saveStorage();

    }

    this.removeSong = (keywords) => {

        reloadStorage();

        var songKeywords = storage.songs.find(s => s.keywords == keywords.replace(/ /g, "+"));
        var songName = storage.songs.find(s => s.name == keywords);
        var songUrl = storage.songs.find(s => keywords.match("youtube.com/watch?v=" + s.id));

        if (songUrl) {
            storage.songs.splice(storage.songs.lastIndexOf(songUrl), 1);
        }
        else if (songKeywords) {
            storage.songs.splice(storage.songs.lastIndexOf(songKeywords), 1);
        }
        else if (songName) {
            storage.songs.splice(storage.songs.lastIndexOf(songName), 1);
        }
        else return false;

        saveStorage();

        if (storage.songs.length == 0) {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);
            conn.dispatcher.end();
        }

        return true;

    }

    this.removeSongs = (keywords) => {

        var moreLeft = true;
        var iterations = 0;

        while (moreLeft) {
            moreLeft = this.removeSong(keywords);
            iterations++;
        }

        return iterations;

    }

    this.endQueue = () => {

        ls.remove(message.guild.id + "musicQueue");

    }

    this.nextSong = () => {

        var isStorage = reloadStorage();

        if (!isStorage) {
            return false;
        }

        storage.index++;
        if (storage.index >= storage.songs.length) {

            storage.index = 0;

            if (storage.loop) {

                saveStorage();

                return storage.songs[storage.index];
            }

            this.endQueue();

            return false;
        }
        
        saveStorage();

        return storage.songs[storage.index];

    }

    this.prevSong = () => {

        var isStorage = reloadStorage();

        if (!isStorage) {
            return false;
        }

        storage.index--;
        if (storage.index < 0) {

            if (storage.loop) {

                storage.index = storage.songs.length - 1;

                saveStorage();

                return storage.songs[storage.index];
            }

            this.endQueue();

            return false;
        }
        
        saveStorage();

        return storage.songs[storage.index];

    }

    this.displaySong = (msg, player) => {

        reloadStorage();

        var song = storage.songs[storage.index];
        var embed = new Interface.Embed(message, "https://images-ext-2.discordapp.net/external/4drkq2ygDPQKt-TGs7QzYXwPsRCueV8-XHF59EcEdqo/https/cdn.discordapp.com/icons/668485643487412234/4a8ae89ac65f47638b418c80269e2de6.jpg", [], 
        `**[${song.name}](https://www.youtube.com/watch?v=${song.id})**\n\n` +
        `\`Requested by: ${song.requester}\``);

        msg.channel.send(embed).then((m) => {

            var loopEmotes = ["🔁", "🔃"];
            var loopEmote = loopEmotes[0];

            if (storage.loop) loopEmote = loopEmotes[1];

            m.react("⏪").then((r) => m.react(loopEmote).then((r2) => m.react("⏩")));

            let forwardsFilter = m.createReactionCollector((reaction, user) => reaction.emoji.name === '⏩' && user.id === msg.author.id, { time: 120000 });
            let loopFilter = m.createReactionCollector((reaction, user) => reaction.emoji.name === loopEmote && user.id === msg.author.id, { time: 120000 });
            let backFilter = m.createReactionCollector((reaction, user) => reaction.emoji.name === '⏪' && user.id === msg.author.id, { time: 120000 });
        
            forwardsFilter.on("collect", r => {
                r.remove(msg.author);

                var song = this.nextSong();
                var desc = "The queue has ended.";
                
                if (song) desc = `**[${song.name}](https://www.youtube.com/watch?v=${song.id})**\n\n` +
                `\`Requested by: ${song.requester}\``;

                var embed = new Interface.Embed(message, "https://images-ext-2.discordapp.net/external/4drkq2ygDPQKt-TGs7QzYXwPsRCueV8-XHF59EcEdqo/https/cdn.discordapp.com/icons/668485643487412234/4a8ae89ac65f47638b418c80269e2de6.jpg", [], desc);
                m.edit(embed);

                var conn = msg.client.voiceConnections.find(val => val.channel.guild.id == msg.guild.id);

                if (!conn) return msg.channel.send(`No music is currently being played in this guild.`);

                if (!song) {
                    m.reactions.find(c => c.emoji.toString() == "⏩").remove("501862549739012106");
                    m.reactions.find(c => c.emoji.toString() == "⏪").remove("501862549739012106");
                    m.reactions.find(c => c.emoji.toString() == loopEmote).remove("501862549739012106");
                    conn.dispatcher.end("skip:false");
                }
                else {

                    var voiceChannel = msg.member.voiceChannel;
                    if (!voiceChannel) return msg.channel.send(`You need to be in a voice channel first!`);

                    if (msg.author.id != this.get().starter || !msg.member.hasPermission("ADMINISTRATOR")) return msg.channel.send(`You must be the starter of the current queue or an administrator to do that.`);

                    conn.dispatcher.end("skip:" + song);
                    msg.channel.send(`Skipped to next song, ${msg.author.tag}.`).then(c => {
                        setTimeout(() => {
                            c.delete();
                        }, 3000);
                    });
                }
            });

            loopFilter.on("collect", r => {
                r.remove(msg.author);
                if (loopEmote == loopEmotes[0]) loopEmote = loopEmotes[1]
                else loopEmote = loopEmotes[0];

                r.remove("501862549739012106");
                m.reactions.find(c => c.emoji.toString() == "⏩").remove("501862549739012106");
                m.react(loopEmote).then(r3 => m.react("⏩"));

                reloadStorage();

                storage.loop = !storage.loop;

                saveStorage();

                var song = storage.songs[storage.index];
                var desc = "The queue has ended.";

                if (song) desc = `**[${song.name}](https://www.youtube.com/watch?v=${song.id})**\n\n` +
                `Loop: ${storage.loop}\n` +
                `\`Requested by: ${song.requester}\``;

                var embed = new Interface.Embed(message, "https://images-ext-2.discordapp.net/external/4drkq2ygDPQKt-TGs7QzYXwPsRCueV8-XHF59EcEdqo/https/cdn.discordapp.com/icons/668485643487412234/4a8ae89ac65f47638b418c80269e2de6.jpg", [], desc);
                m.edit(embed);

                if (!song) {
                    m.reactions.find(c => c.emoji.toString() == "⏩").remove("501862549739012106");
                    m.reactions.find(c => c.emoji.toString() == "⏪").remove("501862549739012106");
                    m.reactions.find(c => c.emoji.toString() == loopEmote).remove("501862549739012106");
                }
            });

            backFilter.on("collect", r => {
                r.remove(msg.author.id);

                var song = this.prevSong();
                var desc = "The queue has ended.";
                
                if (song) desc = `**[${song.name}](https://www.youtube.com/watch?v=${song.id})**\n\n` +
                `\`Requested by: ${song.requester}\``;

                var embed = new Interface.Embed(message, "https://images-ext-2.discordapp.net/external/4drkq2ygDPQKt-TGs7QzYXwPsRCueV8-XHF59EcEdqo/https/cdn.discordapp.com/icons/668485643487412234/4a8ae89ac65f47638b418c80269e2de6.jpg", [], desc);
                m.edit(embed);

                var conn = msg.client.voiceConnections.find(val => val.channel.guild.id == msg.guild.id);

                if (!conn) return msg.channel.send(`No music is currently being played in this guild.`);

                if (!song) {
                    m.reactions.find(c => c.emoji.toString() == "⏩").remove("501862549739012106");
                    m.reactions.find(c => c.emoji.toString() == "⏪").remove("501862549739012106");
                    m.reactions.find(c => c.emoji.toString() == loopEmote).remove("501862549739012106");
                    conn.dispatcher.end("skip:false");
                }
                else {

                    var voiceChannel = msg.member.voiceChannel;
                    if (!voiceChannel) return msg.channel.send(`You need to be in a voice channel first!`);

                    if (msg.author.id != this.get().starter || !msg.member.hasPermission("ADMINISTRATOR")) return msg.channel.send(`You must be the starter of the current queue or an administrator to do that.`);
    
                    conn.dispatcher.end("skip:" + song);
                    msg.channel.send(`Skipped to next song, ${msg.author.tag}.`).then(c => {
                        setTimeout(() => {
                            c.delete();
                        }, 3000);
                    });
                }
            });
        
        });

    }

    reloadStorage();

}

function Player(message, pargs) {

    var queue = new Queue(message);
    var options = {
        name: "",
        id: "",
        author: "",
        msg: message,
        audio: "",
        keywords: ""
    }

    var methods = {
        play: (addingSong, dontDisplay) => {
            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);
            if (!pargs) return message.channel.send(`You need to specify music to search for!`);

            if (addingSong) queue.addSong(options.name, options.id, options.author, options.msg, options.audio, options.keywords);

            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (conn) {
                var song = queue.getSong();
                if (!dontDisplay) queue.displaySong(message);
                
                const dispatcher = conn.playArbitraryInput(song.url);
                dispatcher.on("end", end => {

                    var nextSong = end.match("skip") ? queue.getSong() : queue.nextSong();

                    if (end.match("skip") && end.split("skip:")[1] == "false") nextSong = false;

                    if (!nextSong) {
                        message.channel.send(`Queue has ended. Left music channel, ${message.author.username}.`);
                        voiceChannel.leave();
                    }
                    else methods.play(false, true);

                });
            }
            else {
                voiceChannel.join().then(connection => {
                    message.channel.send(`Joined music channel, ${message.author.username}.`);
                    var song = queue.getSong();

                    if (!dontDisplay) queue.displaySong(message);
                    
                    const dispatcher = connection.playArbitraryInput(song.url);
                    dispatcher.on("end", end => {

                        var nextSong = end.match("skip") ? queue.getSong() : queue.nextSong();

                        if (end.match("skip") && end.split("skip:")[1] == "false") nextSong = false;

                        if (!nextSong) {
                            message.channel.send(`Queue has ended. Left music channel, ${message.author.username}.`);
                            voiceChannel.leave();
                        }
                        else methods.play(false, true);

                    });
                
                }).catch(err => message.channel.send(`Errors found:\n \`\`\`${err}, ${err.stack}\`\`\``));
            }

        },
        stop: () => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);

            if (message.author.id != queue.get().starter || !message.member.hasPermission("ADMINISTRATOR")) return message.channel.send(`You must be the starter of the current queue or an administrator to do that.`);
           
            queue.endQueue();
            conn.dispatcher.end();
            message.channel.send(`Stopped music, ${message.author.tag}.`);
        },
        resume: () => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);

            if (message.author.id != queue.get().starter || !message.member.hasPermission("ADMINISTRATOR")) return message.channel.send(`You must be the starter of the current queue or an administrator to do that.`);
            if (!conn.dispatcher.paused) return message.channel.send(`Music in this guild is already resumed.`);
            
            conn.dispatcher.resume();
            message.channel.send(`Resumed music, ${message.author.tag}.`);
        },
        pause: () => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);

            if (message.author.id != queue.get().starter || !message.member.hasPermission("ADMINISTRATOR")) return message.channel.send(`You must be the starter of the current queue or an administrator to do that.`);
            if (conn.dispatcher.paused) return message.channel.send(`Music in this guild is already paused.`);
            
            conn.dispatcher.pause();
            message.channel.send(`Paused music, ${message.author.tag}.`);
        },
        display: () => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);
            
            queue.displaySong(message, methods);
        },
        skip: (isNext) => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);

            if (message.author.id != queue.get().starter || !message.member.hasPermission("ADMINISTRATOR")) return message.channel.send(`You must be the starter of the current queue or an administrator to do that.`);
            
            if (isNext) queue.nextSong();
            else queue.prevSong();

            conn.dispatcher.end("skip");
            message.channel.send(`Skipped to next song, ${message.author.tag}.`);
        },
        removeSong: (args, removeAll) => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);

            if (message.author.id != queue.get().starter || !message.member.hasPermission("ADMINISTRATOR")) return message.channel.send(`You must be the starter of the current queue or an administrator to do that.`);
            
            if (removeAll) {
                var removed = queue.removeSongs(args.join(" "));
                message.channel.send(`Removed ${removed - 1} song(s) from the queue, ${message.author.tag}.`);
            }
            else {
                var removed = queue.removeSong(args.join(" "));
                if (removed) message.channel.send(`Removed song from the queue, ${message.author.tag}.`);
                else message.channel.send(`Failed to remove song from the queue: could not find the song in the queue.`);
            }
        },
        queue: () => {
            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var songs = queue.get().songs;

            var response = ``;

            songs.forEach((song) => {

                response += `**[${song.name}](https://youtube.com/watch?v=${song.id})** by ${song.artist}\n`;

            });

            var embed = new Interface.Embed(message, "https://images-ext-2.discordapp.net/external/4drkq2ygDPQKt-TGs7QzYXwPsRCueV8-XHF59EcEdqo/https/cdn.discordapp.com/icons/668485643487412234/4a8ae89ac65f47638b418c80269e2de6.jpg", [], response);
            embed.embed.title = "Music Queue";

            message.channel.send(embed);
        },
        addQueue: () => {

            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (!conn) return message.channel.send(`No music is currently being played in this guild.`);

            var voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send(`You need to be in a voice channel first!`);

            fetch("https://cannicideapi.glitch.me/yt/details/" + pargs.join("+"))
            .then(resp => resp.json())
            .then(res => {
                options.name = res.details.name;
                options.id = res.details.id;
                options.author = res.details.author;
                options.keywords = pargs.join("+");
                options.audio = "https://cannicideapi.glitch.me/yt/name/" + options.keywords;

                queue.addSong(options.name, options.id, options.author, options.msg, options.audio, options.keywords);
                message.channel.send(`Added ${options.name} by ${options.author} to the queue.`);
            })
            .catch(() => {
                console.error("Could not fetch music details from CannicideAPI.");
            })

        }
    }

    return new Promise((resolve, reject) => {
        if (pargs) {
            fetch("https://cannicideapi.glitch.me/yt/details/" + pargs.join("+"))
            .then(resp => resp.json())
            .then(res => {
                options.name = res.details.name;
                options.id = res.details.id;
                options.author = res.details.author;
                options.keywords = pargs.join("+");
                options.audio = "https://cannicideapi.glitch.me/yt/name/" + options.keywords;

                resolve(methods);
            })
            .catch(() => {
                reject(new Error("Could not fetch music details from CannicideAPI."));
            })
        }
        else {
            resolve(methods);
        }
    });

}

module.exports = {
    commands: [
        new Command("play", (message, args) => {

            var conn = message.client.voiceConnections.find(val => val.channel.guild.id == message.guild.id);

            if (conn) {
                new Player(message, args).then((player) => {
                    player.addQueue();
                });
            }
            else {
                new Player(message, args).then((player) => {
                    player.play(true);
                });
            }

        }, false, false, "Play a specified song in the voice channel you are in. If already playing a song, the specified song will be added to the queue.").attachArguments([
            {
                name: "keywords",
                optional: false
            }
        ]),

        new Command("pause", (message, args) => {

            new Player(message, false).then((player) => {
                player.pause();
            })

        }, false, false, "Pauses the currently playing song."),

        new Command("stop", (message, args) => {

            new Player(message, false).then((player) => {
                player.stop();
            })

        }, false, false, "Stops the currently playing song, clears the queue, and disconnects Elisif from your voice channel."),

        new Command("resume", (message, args) => {

            new Player(message, false).then((player) => {
                player.resume();
            })

        }, false, false, "Resumes the currently paused song, if paused."),

        new Command("skip", (message, args) => {

            new Player(message, false).then((player) => {
                player.skip(true);
            })

        }, false, false, "Skips the currently playing song, and starts playing the next song in the queue."),

        new Command("song", (message, args) => {

            new Player(message, false).then((player) => {
                player.display();
            })

        }, false, false, "Sends song information as well as controls for queue loop and skipping to the next/previous song in the queue."),

        new Alias("songcontrols", "song"),

        new Alias("controls", "song"),

        new Command("queue", (message, args) => {

            var arg = args[0];

            if (!args || !args[0] || args.length < 1) arg = "list";

            switch(arg.toLowerCase()) {
                case "remove":
                    if (args.length < 2) return message.channel.send(`Please specify a song to remove, ${message.author.tag}.`);

                    new Player(message, false).then((player) => {
                        player.removeSong(args.slice(1), false);
                    })
                break;
                case "removeall":
                    if (args.length < 2) return message.channel.send(`Please specify a song to remove all of, ${message.author.tag}.`);

                    new Player(message, false).then((player) => {
                        player.removeSong(args.slice(1), true);
                    })
                break;
                case "add":
                    if (args.length < 2) return message.channel.send(`Please specify the keywords of a song to add, ${message.author.tag}.`);

                    new Player(message, args.slice(1)).then((player) => {
                        player.addQueue();
                    })
                break;
                default:
                    new Player(message, false).then((player) => {
                        player.queue();
                    })
                break;
            }

        }, false, false, "Remove songs from the queue, remove all duplicates of a song from the queue, add a song to the queue, or list the songs in the queue.").attachArguments([
            {
                name: "remove | removeall | add | list",
                optional: true
            }
        ])
    ]
}