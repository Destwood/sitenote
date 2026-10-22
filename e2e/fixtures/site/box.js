const params = new URLSearchParams(location.search);
const box = document.getElementById("box");
box.style.left = `${params.get("left") ?? "200"}px`;
box.style.top = `${params.get("top") ?? "250"}px`;
