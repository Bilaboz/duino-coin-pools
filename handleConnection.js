const fs = require("fs");

const { ducos1, xxhash } = require("./mining");
const { poolVersion } = require("./config/config.json")
const bans = require("./config/bans.json");
const poolRewards = require("./config/poolRewards.json");

const handle = (conn) => {
    console.log(`New incomming connection: ${conn.remoteAddress}`);
    conn.setEncoding("utf8");
    // generate a unique id for the connection
    conn.id = Math.random().toString(36).substr(2, 9) + Date.now();

    conn.write(poolVersion);

    conn.on("end", () => {
        console.log(`${conn.remoteAddress} disconnected`);
    })

    conn.on("error", (err) => {
        if (err.code !== "ECONNRESET") {
            console.log(`Socket error in connection handler: ${err}`);
        }
    })

    conn.on("data", function mainListener (data) {
        data = data.trim();
        data = data.split(",");

        if (bans.bannedIPs.includes(conn.remoteAddress)) { // check if the ip is banned
            return conn.destroy();
        }

        if (data[0] === "JOB") {
            if (!data[1]) {  // check if username was provided
                conn.write("NO,Not enough data");
                return conn.destroy();
            }

            if (bans.bannedUsernames.includes(data[1])) {
                bans.bannedIPs.push(conn.remoteAddress); // ban the ip
                fs.writeFileSync("./config/bans.json", JSON.stringify(bans, null, 4));
                return conn.destroy();
            }

            ducos1(conn, data, mainListener);
        } else if (data[0] === "JOBXX") {
            if (!data[1]) {  // check if username was provided
                conn.write("NO,Not enough data");
                return conn.destroy();
            }

            if (bans.bannedUsernames.includes(data[1])) {
                bans.bannedIPs.push(conn.remoteAddress); // ban the ip
                fs.writeFileSync("./config/bans.json", JSON.stringify(bans, null, 4));
                return conn.destroy();
            }

            let diff = data[2] ? data[2] : "NET"; // check if a custom diff was provided
            if (!poolRewards.hasOwnProperty(diff)) diff = "NET";

            xxhash(conn, data, mainListener);
        }
    })
}

module.exports = handle;