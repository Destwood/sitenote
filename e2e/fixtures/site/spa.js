const VIEWS = {
  "/spa.html": {
    title: "First page",
    text: "The first page of the single page app.",
    button: "First action",
  },
  "/spa/second": {
    title: "Second page",
    text: "The second page of the single page app.",
    button: "Second action",
  },
};

const view = document.getElementById("view");

function render() {
  const current = VIEWS[location.pathname] ?? VIEWS["/spa.html"];
  const section = document.createElement("section");
  section.className = "hero";
  const heading = document.createElement("h1");
  heading.id = "spa-title";
  heading.textContent = current.title;
  const paragraph = document.createElement("p");
  paragraph.className = "lead";
  paragraph.textContent = current.text;
  const button = document.createElement("button");
  button.className = "cta";
  button.id = "spa-action";
  button.type = "button";
  button.textContent = current.button;
  section.append(heading, paragraph, button);
  view.replaceChildren(section);
}

document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("a[data-route]") : null;
  if (link === null) {
    return;
  }
  event.preventDefault();
  history.pushState({}, "", link.getAttribute("href"));
  render();
});

window.addEventListener("popstate", render);
render();
