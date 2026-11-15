const header = document.querySelector("header");
const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#primary-navigation");
const dropdown = document.querySelector(".dropdown");
const dropdownToggle = document.querySelector(".dropdown-toggle");
const mobileNavigation = window.matchMedia("(max-width: 600px)");

function setMenuOpen(isOpen) {
    header.classList.toggle("nav-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.querySelector(".menu-toggle-label").textContent = isOpen ? "Close" : "Menu";
}

function setDropdownOpen(isOpen) {
    dropdown.classList.toggle("is-open", isOpen);
    dropdownToggle.setAttribute("aria-expanded", String(isOpen));
    dropdownToggle.setAttribute("aria-label", `${isOpen ? "Hide" : "Show"} sports leagues`);
    dropdownToggle.textContent = isOpen ? "−" : "+";
}

menuToggle.addEventListener("click", () => {
    setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
});

dropdownToggle.addEventListener("click", () => {
    setDropdownOpen(dropdownToggle.getAttribute("aria-expanded") !== "true");
});

navigation.addEventListener("click", (event) => {
    if (event.target.closest("a") && mobileNavigation.matches) {
        setMenuOpen(false);
        setDropdownOpen(false);
    }
});

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        (menuToggle.getAttribute("aria-expanded") === "true" || dropdownToggle.getAttribute("aria-expanded") === "true")
    ) {
        const menuWasOpen = menuToggle.getAttribute("aria-expanded") === "true";
        setMenuOpen(false);
        setDropdownOpen(false);
        if (menuWasOpen && mobileNavigation.matches) {
            menuToggle.focus();
        }
    }
});

mobileNavigation.addEventListener("change", () => {
    setMenuOpen(false);
    setDropdownOpen(false);
});
