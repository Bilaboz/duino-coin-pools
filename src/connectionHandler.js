const fs = require("fs");

const { miningHandler } = require("./mining");
const { poolVersion } = require("../config/config.json")
const bans = require("../config/bans.json");

const handle = (conn) => {
    conn.setEncoding("utf8");
    // generate a unique id for the connection
    conn.id = Math.random().toString(36).substr(2, 9);
    console.log(`New incoming connection: ${conn.remoteAddress}#${conn.id}`);

    conn.write(poolVersion);

    conn.on("end", () => {
        console.log(`${conn.remoteAddress}#${conn.id} disconnected`);
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

            miningHandler(conn, data, mainListener, false);
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

            miningHandler(conn, data, mainListener, true);
        }
    })
}

module.exports = handle;
