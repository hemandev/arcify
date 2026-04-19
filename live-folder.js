/**
 * Live Folder - GitHub PR live folders for Arcify
 * 
 * Purpose: Creates and manages live folders that display GitHub PRs as browser tabs
 * Key Functions: Config dialog, folder creation/rendering, PR refresh, alarm management
 */

import { GitHubAPI } from './github-api.js';
import { Logger } from './logger.js';
import { Utils } from './utils.js';

const LIVE_FOLDERS_KEY = 'liveFolders';
const LIVE_FOLDER_ALARM_PREFIX = 'liveFolderRefresh_';

// GitHub PR icon SVG
const GITHUB_PR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path></svg>`;

const REFRESH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path></svg>`;

export class LiveFolder {

    /**
     * Get all live folder configs from storage
     */
    static async getAll() {
        const result = await chrome.storage.local.get(LIVE_FOLDERS_KEY);
        return result[LIVE_FOLDERS_KEY] || {};
    }

    /**
     * Save a live folder config
     */
    static async save(folderId, config) {
        const all = await this.getAll();
        all[folderId] = config;
        await chrome.storage.local.set({ [LIVE_FOLDERS_KEY]: all });
    }

    /**
     * Delete a live folder config
     */
    static async remove(folderId) {
        const all = await this.getAll();
        delete all[folderId];
        await chrome.storage.local.set({ [LIVE_FOLDERS_KEY]: all });
        // Clear alarm
        await chrome.alarms.clear(LIVE_FOLDER_ALARM_PREFIX + folderId);
    }

    /**
     * Set up auto-refresh alarm for a live folder
     */
    static async setupAlarm(folderId, intervalMinutes) {
        const alarmName = LIVE_FOLDER_ALARM_PREFIX + folderId;
        if (intervalMinutes > 0) {
            await chrome.alarms.create(alarmName, {
                periodInMinutes: Math.max(1, intervalMinutes)
            });
        } else {
            await chrome.alarms.clear(alarmName);
        }
    }

    /**
     * Show the config dialog for creating/editing a live folder
     * @param {Object} existingConfig - Existing config for editing, null for new
     * @returns {Promise<Object|null>} Config object or null if cancelled
     */
    static showConfigDialog(existingConfig = null) {
        return new Promise(async (resolve) => {
            // Check for PAT first
            const hasToken = await GitHubAPI.isAuthenticated();

            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'live-folder-dialog-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'live-folder-dialog';

            const title = existingConfig ? 'Edit Live Folder' : 'New Live Folder';

            dialog.innerHTML = `
                <h3 class="live-folder-dialog-title">${title}</h3>
                ${!hasToken ? `
                <div class="live-folder-section">
                    <label class="live-folder-label">GitHub Personal Access Token</label>
                    <input type="password" class="live-folder-input" id="lf-pat-input" 
                           placeholder="ghp_xxxxxxxxxxxx" value="">
                    <small class="live-folder-hint">Needs <code>repo</code> scope. <a href="https://github.com/settings/tokens" target="_blank">Create one</a></small>
                </div>
                ` : `
                <div class="live-folder-section live-folder-auth-status">
                    <span class="live-folder-auth-badge">GitHub Connected</span>
                    <button class="live-folder-btn-small" id="lf-disconnect-btn">Disconnect</button>
                </div>
                `}
                <div class="live-folder-section">
                    <label class="live-folder-label">Folder Name</label>
                    <input type="text" class="live-folder-input" id="lf-name-input" 
                           placeholder="My PRs" value="${existingConfig?.name || ''}">
                </div>
                <div class="live-folder-section">
                    <label class="live-folder-label">Filter</label>
                    <select class="live-folder-select" id="lf-filter-select">
                        <option value="created" ${existingConfig?.config?.filter === 'created' ? 'selected' : ''}>Created by me</option>
                        <option value="assigned" ${existingConfig?.config?.filter === 'assigned' ? 'selected' : ''}>Assigned to me</option>
                        <option value="review-requested" ${existingConfig?.config?.filter === 'review-requested' ? 'selected' : ''}>Review requested</option>
                        <option value="mentioned" ${existingConfig?.config?.filter === 'mentioned' ? 'selected' : ''}>Mentions me</option>
                        <option value="all" ${existingConfig?.config?.filter === 'all' ? 'selected' : ''}>All (no user filter)</option>
                    </select>
                </div>
                <div class="live-folder-section">
                    <label class="live-folder-label">Repositories (optional)</label>
                    <div class="live-folder-repo-list" id="lf-repo-list">
                        ${(existingConfig?.config?.repos || []).map(r => `
                            <span class="live-folder-repo-chip">${r}<button class="live-folder-chip-remove" data-repo="${r}">&times;</button></span>
                        `).join('')}
                    </div>
                    <div class="live-folder-repo-input-row">
                        <input type="text" class="live-folder-input" id="lf-repo-input" 
                               placeholder="owner/repo">
                        <button class="live-folder-btn-small" id="lf-add-repo-btn">Add</button>
                    </div>
                    <small class="live-folder-hint">Leave empty to search all accessible repos</small>
                </div>
                <div class="live-folder-section">
                    <label class="live-folder-label">Auto-Refresh Interval</label>
                    <select class="live-folder-select" id="lf-interval-select">
                        <option value="0" ${existingConfig?.config?.refreshInterval === 0 ? 'selected' : ''}>Manual only</option>
                        <option value="1" ${existingConfig?.config?.refreshInterval === 1 ? 'selected' : ''}>1 minute</option>
                        <option value="5" ${(existingConfig?.config?.refreshInterval === 5 || !existingConfig) ? 'selected' : ''}>5 minutes</option>
                        <option value="15" ${existingConfig?.config?.refreshInterval === 15 ? 'selected' : ''}>15 minutes</option>
                        <option value="30" ${existingConfig?.config?.refreshInterval === 30 ? 'selected' : ''}>30 minutes</option>
                    </select>
                </div>
                <div class="live-folder-actions">
                    <button class="live-folder-btn live-folder-btn-cancel" id="lf-cancel-btn">Cancel</button>
                    <button class="live-folder-btn live-folder-btn-save" id="lf-save-btn">${existingConfig ? 'Save' : 'Create'}</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Repo list management
            const repos = [...(existingConfig?.config?.repos || [])];
            const repoList = dialog.querySelector('#lf-repo-list');
            const repoInput = dialog.querySelector('#lf-repo-input');
            const addRepoBtn = dialog.querySelector('#lf-add-repo-btn');

            function renderRepos() {
                repoList.innerHTML = repos.map(r => `
                    <span class="live-folder-repo-chip">${r}<button class="live-folder-chip-remove" data-repo="${r}">&times;</button></span>
                `).join('');
                // Re-bind remove buttons
                repoList.querySelectorAll('.live-folder-chip-remove').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = repos.indexOf(btn.dataset.repo);
                        if (idx >= 0) repos.splice(idx, 1);
                        renderRepos();
                    });
                });
            }

            addRepoBtn.addEventListener('click', () => {
                const val = repoInput.value.trim();
                if (val && val.includes('/') && !repos.includes(val)) {
                    repos.push(val);
                    repoInput.value = '';
                    renderRepos();
                }
            });

            repoInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addRepoBtn.click();
                }
            });

            // Disconnect button
            const disconnectBtn = dialog.querySelector('#lf-disconnect-btn');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', async () => {
                    await GitHubAPI.removeToken();
                    overlay.remove();
                    resolve(null);
                });
            }

            // Cancel
            dialog.querySelector('#lf-cancel-btn').addEventListener('click', () => {
                overlay.remove();
                resolve(null);
            });

            // Click outside to cancel
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve(null);
                }
            });

            // Save
            dialog.querySelector('#lf-save-btn').addEventListener('click', async () => {
                const patInput = dialog.querySelector('#lf-pat-input');
                if (patInput) {
                    const pat = patInput.value.trim();
                    if (!pat) {
                        patInput.style.borderColor = '#ff4444';
                        patInput.placeholder = 'Token is required';
                        return;
                    }
                    // Validate token
                    const user = await GitHubAPI.validateToken(pat);
                    if (!user) {
                        patInput.style.borderColor = '#ff4444';
                        patInput.value = '';
                        patInput.placeholder = 'Invalid token, try again';
                        return;
                    }
                    await GitHubAPI.setToken(pat);
                }

                const name = dialog.querySelector('#lf-name-input').value.trim() || 'GitHub PRs';
                const filter = dialog.querySelector('#lf-filter-select').value;
                const refreshInterval = parseInt(dialog.querySelector('#lf-interval-select').value, 10);

                overlay.remove();
                resolve({
                    id: existingConfig?.id || Utils.generateUUID(),
                    name,
                    config: {
                        repos: [...repos],
                        filter,
                        refreshInterval
                    }
                });
            });

            renderRepos();
        });
    }

    /**
     * Create live folder DOM element in the sidebar
     * @param {Object} folderConfig - The live folder config
     * @param {HTMLElement} pinnedContainer - The pinned tabs container
     * @param {number} activeSpaceId - Current space's Chrome group ID  
     * @param {Function} createTabElementFn - Reference to createTabElement function
     * @returns {HTMLElement} The folder element
     */
    static createFolderElement(folderConfig, pinnedContainer, activeSpaceId, createTabElementFn) {
        const folderTemplate = document.getElementById('folderTemplate');
        const newFolder = folderTemplate.content.cloneNode(true);
        const folderElement = newFolder.querySelector('.folder');
        const folderHeader = folderElement.querySelector('.folder-header');
        const folderIcon = folderElement.querySelector('.folder-icon');
        const folderTitle = folderElement.querySelector('.folder-title');
        const folderNameInput = folderElement.querySelector('.folder-name');
        const folderContent = folderElement.querySelector('.folder-content');
        const folderToggle = folderElement.querySelector('.folder-toggle');

        // Mark as live folder
        folderElement.classList.add('live-folder');
        folderElement.dataset.liveFolderId = folderConfig.id;

        // Set icon to GitHub PR icon
        folderIcon.innerHTML = GITHUB_PR_ICON;

        // Set name
        folderTitle.textContent = folderConfig.name;
        folderTitle.style.display = 'inline';
        folderNameInput.style.display = 'none';

        // Open by default
        folderElement.classList.remove('collapsed');
        folderContent.classList.remove('collapsed');
        folderToggle.classList.remove('collapsed');

        // Add refresh button to header
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'live-folder-refresh-btn';
        refreshBtn.innerHTML = REFRESH_ICON;
        refreshBtn.title = 'Refresh PRs';
        refreshBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            refreshBtn.classList.add('spinning');
            await this.refreshFolder(folderConfig, folderElement, activeSpaceId, createTabElementFn);
            refreshBtn.classList.remove('spinning');
        });
        folderHeader.insertBefore(refreshBtn, folderToggle);

        // Add PR count badge
        const badge = document.createElement('span');
        badge.className = 'live-folder-badge';
        badge.textContent = '0';
        folderHeader.insertBefore(badge, refreshBtn);

        // Toggle collapse
        folderHeader.addEventListener('click', () => {
            folderElement.classList.toggle('collapsed');
            folderContent.classList.toggle('collapsed');
            folderToggle.classList.toggle('collapsed');
        });

        // Context menu
        this.setupContextMenu(folderElement, folderConfig, pinnedContainer, activeSpaceId, createTabElementFn);

        // Add to container
        pinnedContainer.appendChild(folderElement);

        // Initial refresh
        refreshBtn.classList.add('spinning');
        this.refreshFolder(folderConfig, folderElement, activeSpaceId, createTabElementFn).then(() => {
            refreshBtn.classList.remove('spinning');
        });

        // Setup alarm
        this.setupAlarm(folderConfig.id, folderConfig.config.refreshInterval);

        return folderElement;
    }

    /**
     * Refresh a live folder - fetch PRs, diff with existing tabs, update
     */
    static async refreshFolder(folderConfig, folderElement, activeSpaceId, createTabElementFn) {
        Logger.log('[LiveFolder] Refreshing:', folderConfig.name);
        const folderContent = folderElement.querySelector('.folder-content');
        const badge = folderElement.querySelector('.live-folder-badge');

        try {
            const prs = await GitHubAPI.fetchPullRequests(folderConfig.config);

            // Build a stable tabId <-> prUrl mapping from persisted config
            // This survives tab navigation — we track which tab belongs to which PR by ID, not current URL
            const tabIdToPrUrl = new Map(Object.entries(folderConfig.tabIdToPrUrl || {}));
            const prUrlToTabId = new Map();
            for (const [tabId, prUrl] of tabIdToPrUrl) {
                prUrlToTabId.set(prUrl, parseInt(tabId));
            }

            // Build DOM lookup by tab ID
            const existingTabs = folderContent.querySelectorAll('.tab');
            const tabIdToElement = new Map();
            existingTabs.forEach(el => {
                const tabId = parseInt(el.dataset.tabId);
                if (tabId) tabIdToElement.set(tabId, el);
            });

            // Verify which mapped tabs still exist in Chrome
            for (const [tabIdStr] of tabIdToPrUrl) {
                const tabId = parseInt(tabIdStr);
                try { await chrome.tabs.get(tabId); } catch (e) {
                    // Tab was closed by user — remove from mapping
                    const prUrl = tabIdToPrUrl.get(tabIdStr);
                    tabIdToPrUrl.delete(tabIdStr);
                    prUrlToTabId.delete(prUrl);
                    const el = tabIdToElement.get(tabId);
                    if (el) el.remove();
                }
            }

            const newPrUrls = new Set(prs.map(pr => pr.url));

            // Close tabs for PRs that are no longer open (merged/closed)
            for (const [prUrl, tabId] of prUrlToTabId) {
                if (!newPrUrls.has(prUrl)) {
                    tabIdToPrUrl.delete(String(tabId));
                    prUrlToTabId.delete(prUrl);
                    const el = tabIdToElement.get(tabId);
                    if (el) el.remove();
                    try { await chrome.tabs.remove(tabId); } catch (e) { /* already closed */ }
                }
            }

            // Add new PRs (only for PRs that don't already have an associated tab)
            globalThis.__arcifyCreatingLiveFolderTabs = true;
            for (const pr of prs) {
                if (prUrlToTabId.has(pr.url)) continue; // Already has a live tab (even if user navigated away)

                // Create a real tab for this PR
                try {
                    const tab = await new Promise((resolve, reject) => {
                        chrome.tabs.create({ url: pr.url, active: false }, (t) => {
                            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                            else resolve(t);
                        });
                    });

                    // Add to the space's tab group
                    if (activeSpaceId) {
                        await chrome.tabs.group({ tabIds: tab.id, groupId: activeSpaceId });
                    }

                    // Create tab element using the extension's existing tab renderer
                    const tabElement = await createTabElementFn(
                        { ...tab, url: pr.url, title: `#${pr.number} ${pr.title}`, favIconUrl: pr.authorAvatar },
                        true, // isPinned
                        false  // isBookmarkOnly
                    );

                    if (tabElement) {
                        tabElement.dataset.liveFolderId = folderConfig.id;
                        tabElement.dataset.prNumber = pr.number;
                        tabElement.dataset.prUrl = pr.url;

                        // Track the mapping: tabId -> original PR URL
                        tabIdToPrUrl.set(String(tab.id), pr.url);
                        prUrlToTabId.set(pr.url, tab.id);

                        // Remove placeholder if present
                        const placeholder = folderContent.querySelector('.tab-placeholder');
                        if (placeholder) placeholder.style.display = 'none';

                        folderContent.appendChild(tabElement);
                    }
                } catch (e) {
                    Logger.error('[LiveFolder] Failed to create tab for PR:', pr.url, e);
                }
            }
            globalThis.__arcifyCreatingLiveFolderTabs = false;

            // Update badge
            if (badge) {
                badge.textContent = prs.length;
                badge.style.display = prs.length > 0 ? 'inline-flex' : 'none';
            }

            // Persist the stable tabId <-> prUrl mapping
            folderConfig.tabIds = [...prUrlToTabId.values()];
            folderConfig.tabIdToPrUrl = Object.fromEntries(tabIdToPrUrl);
            folderConfig.lastRefreshed = Date.now();
            await this.save(folderConfig.id, folderConfig);

        } catch (e) {
            globalThis.__arcifyCreatingLiveFolderTabs = false;
            Logger.error('[LiveFolder] Refresh failed:', e);
            if (badge) {
                badge.textContent = '!';
                badge.classList.add('error');
            }
        }
    }

    /**
     * Context menu for live folders (edit, refresh, delete)
     */
    static setupContextMenu(folderElement, folderConfig, pinnedContainer, activeSpaceId, createTabElementFn) {
        folderElement.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const contextMenu = document.createElement('div');
            contextMenu.classList.add('context-menu');
            contextMenu.style.position = 'fixed';
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;

            // Edit
            const editOption = document.createElement('div');
            editOption.classList.add('context-menu-item');
            editOption.textContent = 'Edit Live Folder';
            editOption.addEventListener('click', async () => {
                contextMenu.remove();
                const updated = await this.showConfigDialog(folderConfig);
                if (updated) {
                    // Update config
                    Object.assign(folderConfig, updated);
                    await this.save(folderConfig.id, folderConfig);
                    // Update name
                    folderElement.querySelector('.folder-title').textContent = updated.name;
                    // Re-setup alarm
                    await this.setupAlarm(folderConfig.id, updated.config.refreshInterval);
                    // Refresh
                    await this.refreshFolder(folderConfig, folderElement, activeSpaceId, createTabElementFn);
                }
            });

            // Refresh
            const refreshOption = document.createElement('div');
            refreshOption.classList.add('context-menu-item');
            refreshOption.textContent = 'Refresh Now';
            refreshOption.addEventListener('click', async () => {
                contextMenu.remove();
                const refreshBtn = folderElement.querySelector('.live-folder-refresh-btn');
                if (refreshBtn) refreshBtn.classList.add('spinning');
                await this.refreshFolder(folderConfig, folderElement, activeSpaceId, createTabElementFn);
                if (refreshBtn) refreshBtn.classList.remove('spinning');
            });

            // Delete
            const deleteOption = document.createElement('div');
            deleteOption.classList.add('context-menu-item');
            deleteOption.textContent = 'Delete Live Folder';
            deleteOption.addEventListener('click', async () => {
                contextMenu.remove();
                if (confirm('Delete this live folder? Open PR tabs will remain.')) {
                    await this.remove(folderConfig.id);
                    folderElement.remove();
                }
            });

            contextMenu.appendChild(editOption);
            contextMenu.appendChild(refreshOption);
            contextMenu.appendChild(deleteOption);
            document.body.appendChild(contextMenu);

            const closeMenu = (e) => {
                if (!contextMenu.contains(e.target)) {
                    contextMenu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        });
    }

    /**
     * Check if an alarm name is for a live folder
     */
    static isLiveFolderAlarm(alarmName) {
        return alarmName.startsWith(LIVE_FOLDER_ALARM_PREFIX);
    }

    /**
     * Get folder ID from alarm name
     */
    static getFolderIdFromAlarm(alarmName) {
        return alarmName.replace(LIVE_FOLDER_ALARM_PREFIX, '');
    }
}
