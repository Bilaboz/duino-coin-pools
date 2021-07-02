const connections = document.getElementById("connections");
const cpu = document.getElementById("cpu");
const ram = document.getElementById("ram");

fetch("/statistics")
.then(response => response.json())
.then(data => {
    connections.innerHTML = data["connections"];
    cpu.innerHTML = data["cpu"] + "%";
    ram.innerHTML = data["ram"] + "%";
})