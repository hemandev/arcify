/**
 * YouTube Controller - Content script for YouTube media control
 * 
 * Purpose: Controls YouTube's video player and reports playback state to the sidebar
 * Architecture: Injected into YouTube pages, communicates via chrome.runtime messages
 * 
 * Critical Notes:
 * - YouTube is a SPA; uses yt-navigate-finish to detect page changes
 * - Attaches to the <video> element for direct playback control
 * - Debounces timeupdate events to avoid flooding the message channel
 */

(function () {
    let video = null;
    let updateInterval = null;
    let lastReportedState = null;

    function getVideoTitle() {
        // Primary: structured data
        const ld = document.querySelector('script[type="application/ld+json"]');
        if (ld) {
            try {
                const data = JSON.parse(ld.textContent);
                if (data.name) return data.name;
            } catch (e) { }
        }
        // Fallback: meta tag
        const meta = document.querySelector('meta[name="title"]');
        if (meta) return meta.content;
        // Fallback: page title (strip " - YouTube")
        return document.title.replace(/ - YouTube$/, '');
    }

    function getChannelName() {
        const el = document.querySelector('#channel-name a, ytd-video-owner-renderer #text a');
        return el ? el.textContent.trim() : '';
    }

    function getThumbnail() {
        const url = window.location.href;
        const match = url.match(/[?&]v=([^&]+)/);
        if (match) {
            return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
        }
        return '';
    }

    function isVideoPage() {
        return window.location.pathname === '/watch';
    }

    function sendState(forceUpdate = false) {
        if (!video || !isVideoPage()) return;

        const state = {
            action: 'mediaStateUpdate',
            title: getVideoTitle(),
            channel: getChannelName(),
            thumbnail: getThumbnail(),
            isPlaying: !video.paused && !video.ended,
            currentTime: video.currentTime,
            duration: video.duration || 0,
            url: window.location.href,
        };

        // Only send if something changed (or forced)
        const stateKey = `${state.isPlaying}|${Math.floor(state.currentTime)}|${state.title}`;
        if (!forceUpdate && stateKey === lastReportedState) return;
        lastReportedState = stateKey;

        try {
            chrome.runtime.sendMessage(state).catch(() => {
                // Receiver not available (sidebar closed, etc.) — ignore.
                // Do NOT cleanup; keep tracking so we can resume when the sidebar reopens.
            });
        } catch (e) {
            // Synchronous send error (context truly gone during extension update).
            // Still don't cleanup — the interval will retry and succeed after reload.
        }
    }

    function attachToVideo() {
        const v = document.querySelector('video');
        if (!v) return;
        if (v === video) return;

        // Detach old listeners implicitly (old element will be GC'd)
        video = v;

        video.addEventListener('play', () => sendState(true));
        video.addEventListener('pause', () => sendState(true));
        video.addEventListener('ended', () => sendState(true));
        video.addEventListener('seeked', () => sendState(true));

        // Send periodic updates for progress bar (every 1s)
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
            // Re-check in case YouTube swapped the video element (SPA navigation)
            const current = document.querySelector('video');
            if (current && current !== video) {
                attachToVideo();
                return;
            }
            sendState();
        }, 1000);

        // Initial state
        setTimeout(() => sendState(true), 500);
    }

    function cleanup() {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        video = null;
        lastReportedState = null;
    }

    function handleNavigate() {
        if (isVideoPage()) {
            // Wait for video element to appear
            setTimeout(attachToVideo, 1000);
        } else {
            cleanup();
            try {
                chrome.runtime.sendMessage({ action: 'mediaStateStopped' }).catch(() => {});
            } catch (e) { }
        }
    }

    // Listen for commands from the sidebar/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Try to re-acquire video if we lost it
        if (!video) {
            const v = document.querySelector('video');
            if (v) attachToVideo();
            else return;
        }
        switch (message.action) {
            case 'mediaPlay':
                video.play();
                break;
            case 'mediaPause':
                video.pause();
                break;
            case 'mediaTogglePlayPause':
                if (video.paused) video.play();
                else video.pause();
                break;
            case 'mediaSkipForward':
                video.currentTime = Math.min(video.currentTime + 10, video.duration);
                break;
            case 'mediaSkipBack':
                video.currentTime = Math.max(video.currentTime - 10, 0);
                break;
        }
    });

    // YouTube SPA navigation detection
    window.addEventListener('yt-navigate-finish', handleNavigate);

    // Also observe for video element appearing (for initial load)
    const observer = new MutationObserver(() => {
        if (isVideoPage() && document.querySelector('video') && !video) {
            attachToVideo();
        }
    });
    observer.observe(document.body || document.documentElement, {
        childList: true, subtree: true
    });

    // Initial check
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        handleNavigate();
    } else {
        window.addEventListener('DOMContentLoaded', handleNavigate);
    }
})();
