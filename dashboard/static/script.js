const connections = document.getElementById("connections");
const cpu = document.getElementById("cpu");
const ram = document.getElementById("ram");
const workers = document.getElementById("workers");

function fetch_statistics() {
    fetch("/statistics")
        .then(response => response.json())
        .then(data => {
            connections.innerHTML = data["connections"];
            cpu.innerHTML = data["cpu"].toFixed(2) + "%";
            ram.innerHTML = data["ram"].toFixed(2) + "%";
        })
}

fetch_statistics();
setInterval(function() {
    // run every 5s
    fetch_statistics(); 
}, 5000);