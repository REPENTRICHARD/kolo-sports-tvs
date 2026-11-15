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

const navigationTargets = [...navigation.querySelectorAll('a[href^="#"]')]
    .map((link) => ({ link, target: document.getElementById(link.hash.slice(1)) }))
    .filter(({ target }) => target);
let navigationFrame = 0;

function updateActiveNavigation() {
    const activeLine = header.getBoundingClientRect().bottom + 24;
    let activeLink = navigationTargets[0]?.link;

    navigationTargets.forEach(({ link, target }) => {
        if (target.getBoundingClientRect().top <= activeLine) {
            activeLink = link;
        }
    });

    navigation.querySelectorAll('a[aria-current="location"]').forEach((link) => {
        link.removeAttribute("aria-current");
    });
    activeLink?.setAttribute("aria-current", "location");
}

function scheduleActiveNavigationUpdate() {
    if (navigationFrame) {
        return;
    }

    navigationFrame = window.requestAnimationFrame(() => {
        updateActiveNavigation();
        navigationFrame = 0;
    });
}

window.addEventListener("scroll", scheduleActiveNavigationUpdate, { passive: true });
window.addEventListener("resize", scheduleActiveNavigationUpdate);
updateActiveNavigation();

const videos = document.querySelectorAll("#videos video");
const hlsMimeType = "application/vnd.apple.mpegurl";
const hlsPlayers = new WeakMap();
let hlsLibraryPromise;

function loadHlsLibrary() {
    if (window.Hls) {
        return Promise.resolve(window.Hls);
    }

    if (!hlsLibraryPromise) {
        hlsLibraryPromise = new Promise((resolve, reject) => {
            const libraryScript = document.createElement("script");
            libraryScript.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
            libraryScript.async = true;
            libraryScript.onload = () => resolve(window.Hls);
            libraryScript.onerror = () => reject(new Error("Could not download the HLS player."));
            document.head.append(libraryScript);
        });
    }

    return hlsLibraryPromise;
}

function useMp4Fallback(video) {
    const hlsPlayer = hlsPlayers.get(video);
    if (hlsPlayer) {
        hlsPlayer.destroy();
        hlsPlayers.delete(video);
    }

    video.dataset.stream = "mp4";
    video.removeAttribute("src");
    video.preload = "metadata";
    video.load();
}

async function loadAdaptiveVideo(video) {
    if (video.dataset.loaded === "true" || video.dataset.playRequested === "true") {
        return;
    }

    video.dataset.loaded = "true";
    video.preload = "metadata";
    const hlsUrl = video.dataset.hls;

    if (!hlsUrl || location.protocol === "file:") {
        video.load();
        return;
    }

    const streamUrl = new URL(hlsUrl, document.baseURI).href;
    if (video.canPlayType(hlsMimeType)) {
        video.dataset.stream = "native-hls";
        video.src = streamUrl;
        video.addEventListener("error", () => {
            if (video.dataset.stream === "native-hls") {
                console.error("Native HLS playback failed; switching to the MP4 fallback.", video.error);
                useMp4Fallback(video);
            }
        });
        video.load();
        return;
    }

    const supportsAacInMediaSource =
        "MediaSource" in window &&
        window.MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"');
    if (!supportsAacInMediaSource) {
        useMp4Fallback(video);
        return;
    }

    try {
        const Hls = await loadHlsLibrary();
        if (video.dataset.playRequested === "true") {
            return;
        }

        if (!Hls || !Hls.isSupported()) {
            useMp4Fallback(video);
            return;
        }

        const hlsPlayer = new Hls({ autoStartLoad: false, capLevelToPlayerSize: true });
        hlsPlayers.set(video, hlsPlayer);
        video.dataset.stream = "hls.js";

        hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                console.error("Adaptive video playback failed; switching to the MP4 fallback.", data);
                useMp4Fallback(video);
            }
        });

        video.addEventListener("play", () => {
            if (hlsPlayers.get(video) === hlsPlayer) {
                hlsPlayer.startLoad();
            }
        }, { once: true });

        hlsPlayer.loadSource(streamUrl);
        hlsPlayer.attachMedia(video);
    } catch (error) {
        console.error("Could not initialize adaptive video playback; switching to the MP4 fallback.", error);
        useMp4Fallback(video);
    }
}

videos.forEach((video) => {
    video.addEventListener("play", () => {
        video.dataset.playRequested = "true";
    }, { once: true });
});

if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                loadAdaptiveVideo(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: "200px 0px" });

    videos.forEach((video) => videoObserver.observe(video));
} else {
    videos.forEach((video) => {
        video.addEventListener("pointerenter", () => loadAdaptiveVideo(video), { once: true });
        video.addEventListener("focus", () => loadAdaptiveVideo(video), { once: true });
    });
}

if (
    "IntersectionObserver" in window &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -24px 0px" });

    document.querySelectorAll(".gallery-item, .video-card, #sports > div[id]").forEach((item) => {
        item.classList.add("js-reveal");
        revealObserver.observe(item);
    });
}
