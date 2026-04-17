# Arcify Chrome Extension

## Project Overview

This Chrome extension provides Arc browser-like sidebar functionality for managing tabs, spaces, and bookmarks. It organizes browser tabs into spaces (tab groups) and allows users to:

- Create and manage multiple spaces (similar to Arc's Spaces)
- Save tabs as bookmarks within spaces
- Easily switch between spaces
- Archive and restore tabs
- Drag and drop tabs between spaces or within a space

### Key Files

- `sidebar.js` - Main UI and functionality implementation
- `chromeHelper.js` - Helper functions for Chrome API interactions
- `localstorage.js` - Storage management for persistent data
- `utils.js` - Utility functions used throughout the extension
- `icons.js` - SVG icon definitions for the UI
- `github-api.js` - GitHub API client for PAT auth and PR fetching
- `live-folder.js` - Live folder UI, config dialog, refresh logic
- `youtube-controller.js` - YouTube media control content script

## Architecture

### Core Concepts

- **Spaces**: Chrome tab groups with additional metadata and bookmarks
- **Tabs**: Browser tabs that can be either temporary or pinned (bookmarked)
- **Bookmarks**: Saved tabs that persist even when the tab is closed

### State Management

The extension maintains a global `spaces` array, with each space containing:
- `id`: Chrome tab group ID
- `uuid`: Unique identifier
- `name`: Display name
- `color`: Color theme
- `spaceBookmarks`: Array of pinned tab IDs
- `temporaryTabs`: Array of temporary tab IDs

Chrome bookmarks are used as the persistent storage mechanism. Each space has a corresponding bookmark folder.

### State Persistence

State is persisted in two ways:

1. **Chrome bookmarks API** - Each space has its own folder; bookmarked tabs are stored in these folders
2. **Chrome storage API** - `saveSpaces()` saves to `chrome.storage.local`; the spaces array contains the current state

### Event Handlers

The extension uses Chrome event listeners:
- `chrome.tabs.onCreated` - New tab creation
- `chrome.tabs.onUpdated` - Tab URL or title changes
- `chrome.tabs.onRemoved` - Tab closures
- `chrome.tabs.onActivated` - Tab switching

### DOM Structure

- Space switcher at top
- Per-space tab container (pinned tabs section + temporary tabs section)
- Add space and new tab buttons

## Key Functions

### Space Management

- `initSidebar()` - Initialize the sidebar, creating default spaces if needed
- `createSpaceElement(space)` - Create DOM elements for a space
- `setActiveSpace(spaceId)` - Switch to a specific space
- `createNewSpace()` / `deleteSpace(spaceId)`

### Tab Management

- `createTabElement(tab, isPinned, isBookmarkOnly)` - Create DOM element for a tab
- `loadTabs(space, pinnedContainer, tempContainer)` - Load tabs for a space
- `createNewTab()` - Create a new tab in the active space
- `closeTab(tabElement, tab, isPinned, isBookmarkOnly)` - Close a tab
- `moveTabToPinned(space, tab)` / `moveTabToTemp(space, tab)` / `moveTabToSpace(tabId, spaceId, pinned)`

### Event Handlers

- `handleTabCreated(tab)` / `handleTabUpdate(tabId, changeInfo, tab)` / `handleTabRemove(tabId)` / `handleTabActivated(activeInfo)`

### Bookmarks

- `updateBookmarkForTab(tab)` - Update bookmark for a tab
- `searchBookmarks(folderId, tab)` - Search for bookmark matching a tab

### UI Features

- `setupDragAndDrop(pinnedContainer, tempContainer)`
- `showTabContextMenu(x, y, tab, isPinned, isBookmarkOnly, tabElement)`
- `showArchivedTabsPopup()` / `updatePinnedFavicons()`

## Helper Modules

### ChromeHelper

Encapsulates Chrome API interactions: creating tabs, creating tab groups, managing tab groups.

### LocalStorage

Manages persistent storage using Chrome's bookmarks API:
- `getOrCreateArcifyFolder()` - Gets or creates the root bookmark folder
- `getOrCreateSpaceFolder(name)` - Gets or creates a bookmark folder for a space

### Utils

Utility functions for generating UUIDs, getting settings, getting favicon URLs, managing tab name overrides, handling tab archiving/restoration.

### Constants

- `MouseButton` - Enum for mouse button values
- Default space names and colors
- Global state flags: `isCreatingSpace`, `isOpeningBookmark`

## Live Folders

Live folders display GitHub PRs as real browser tabs inside a folder. Configured via a dialog (PAT auth, repo selection, filter, refresh interval). PRs are fetched from the GitHub Search API and rendered using the standard `createTabElement` flow. On refresh, new PRs open as tabs and closed/merged PRs are auto-removed. Auto-refresh uses `chrome.alarms`. Config and tab IDs are persisted in `chrome.storage.local` under the `liveFolders` key. A `globalThis.__arcifyCreatingLiveFolderTabs` flag prevents `handleTabCreated` from duplicating PR tabs into the temporary section.

## YouTube Media Controller

A content script (`youtube-controller.js`) injected on YouTube pages that tracks playback state (title, channel, thumbnail, play/pause, progress) and sends updates to the sidebar via `chrome.runtime.sendMessage`. The sidebar renders a mini media player bar with play/pause, skip forward/back, and go-to-tab controls. The background service worker relays messages between the content script and sidebar and tracks the active media tab ID.

## Initialization Flow

1. Event listener setup on `DOMContentLoaded`
2. `initSidebar()` - Chrome API calls to get current tabs/groups, create spaces, set up DOM and event handlers
3. Setup Chrome tab event listeners

## Event Flow

1. User interacts with UI (clicks, drags tabs)
2. Event handlers update the DOM
3. Chrome API calls update the browser state
4. `saveSpaces()` persists the updated state
