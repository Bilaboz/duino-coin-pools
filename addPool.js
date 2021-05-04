const poolPassword = ""

async function addPool() {
    const res = await axios.get("https://api.ipify.org/");
    if (!res.data) {
        console.log("Error: can't get the pool IP");
        exit(1);
    }
    const ip = res.data;

    const loginInfos = {
        name: "PUT YOUR POOL NAME HERE",
        host: ip,
        port: "PUT YOUR PORT HERE",
        identifier: "PUT YOUR POOL ID HERE", // put something like your hwid, this is like a password
        hidden: "ok"
    };

    const socket = new net.Socket();
    socket.setEncoding("utf-8");
    socket.connect(serverPort, serverIP);

    socket.on("error", (err) => {
        console.log(`Socket error at addPool: ${err}`);
        exit(1);
    });

    socket.on("timeout", () => {
        console.log("Socket timeout at addPool");
        exit(1);
    });

    socket.on("data", (data) => {
        console.log(data);
        if (data.startsWith("2")) {
            socket.write(`PoolLoginAdd,${poolPassword},${JSON.stringify(loginInfos)}`);
        } else if (data === "LoginOK") {
            console.log("Pool successfully added");
        } else {
            console.log(`Unknown error, server returned ${data} in addPool`);
            exit(data);
        }
    });
}

addPool();