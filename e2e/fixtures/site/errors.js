setTimeout(() => {
  throw new Error("fixture uncaught error");
}, 0);

Promise.reject(new Error("fixture unhandled rejection"));

document.getElementById("log-error").addEventListener("click", () => {
  console.error("fixture console error", { id: 7 });
});
