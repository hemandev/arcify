/**
 * GitHub API - PAT-based authentication and PR fetching
 * 
 * Purpose: Manages GitHub Personal Access Token storage and fetches pull requests
 * Key Functions: Token management, PR search with configurable filters
 */

import { Logger } from './logger.js';

const GITHUB_TOKEN_KEY = 'githubPat';
const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubAPI {

    /**
     * Get stored PAT from chrome.storage.local
     */
    static async getToken() {
        const result = await chrome.storage.local.get(GITHUB_TOKEN_KEY);
        return result[GITHUB_TOKEN_KEY] || null;
    }

    /**
     * Save PAT to chrome.storage.local
     */
    static async setToken(token) {
        await chrome.storage.local.set({ [GITHUB_TOKEN_KEY]: token });
    }

    /**
     * Remove stored PAT
     */
    static async removeToken() {
        await chrome.storage.local.remove(GITHUB_TOKEN_KEY);
    }

    /**
     * Check if a valid token is stored
     */
    static async isAuthenticated() {
        const token = await this.getToken();
        return !!token;
    }

    /**
     * Validate token by fetching the authenticated user
     * @returns {Object|null} User object or null if invalid
     */
    static async validateToken(token) {
        try {
            const resp = await fetch(`${GITHUB_API_BASE}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            Logger.error('[GitHubAPI] Token validation failed:', e);
            return null;
        }
    }

    /**
     * Get the authenticated user's login
     */
    static async getUsername() {
        const token = await this.getToken();
        if (!token) return null;
        const user = await this.validateToken(token);
        return user?.login || null;
    }

    /**
     * Fetch user's repos (for repo picker)
     * @returns {Array} Array of {full_name, name, owner}
     */
    static async getUserRepos() {
        const token = await this.getToken();
        if (!token) return [];

        try {
            const repos = [];
            let page = 1;
            const perPage = 100;
            // Fetch up to 300 repos
            while (page <= 3) {
                const resp = await fetch(
                    `${GITHUB_API_BASE}/user/repos?per_page=${perPage}&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
                    {
                        headers: {
                            'Authorization': `token ${token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );
                if (!resp.ok) break;
                const data = await resp.json();
                repos.push(...data);
                if (data.length < perPage) break;
                page++;
            }
            return repos.map(r => ({ full_name: r.full_name, name: r.name, owner: r.owner.login }));
        } catch (e) {
            Logger.error('[GitHubAPI] Failed to fetch repos:', e);
            return [];
        }
    }

    /**
     * Fetch pull requests based on live folder config
     * @param {Object} config - { repos: string[], filter: string, customQuery: string }
     *   filter: "created" | "assigned" | "review-requested" | "all"
     * @returns {Array} Array of PR objects
     */
    static async fetchPullRequests(config) {
        const token = await this.getToken();
        if (!token) throw new Error('GitHub token not configured');

        const username = await this.getUsername();
        if (!username && config.filter !== 'all') {
            throw new Error('Could not determine GitHub username');
        }

        // Build search query
        let qualifiers = ['is:pr', 'is:open', 'archived:false'];

        // Repo filter
        if (config.repos && config.repos.length > 0) {
            for (const repo of config.repos) {
                qualifiers.push(`repo:${repo}`);
            }
        }

        // Author/assignee filter
        switch (config.filter) {
            case 'created':
                qualifiers.push(`author:${username}`);
                break;
            case 'assigned':
                qualifiers.push(`assignee:${username}`);
                break;
            case 'review-requested':
                qualifiers.push(`review-requested:${username}`);
                break;
            case 'mentioned':
                qualifiers.push(`mentions:${username}`);
                break;
            case 'all':
                // No user filter
                break;
        }

        const query = qualifiers.join(' ');
        Logger.log('[GitHubAPI] Search query:', query);

        try {
            const resp = await fetch(
                `${GITHUB_API_BASE}/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=30`,
                {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (!resp.ok) {
                const errBody = await resp.text();
                Logger.error('[GitHubAPI] Search failed:', resp.status, errBody);
                throw new Error(`GitHub API error: ${resp.status}`);
            }

            const data = await resp.json();
            return data.items.map(pr => ({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                url: pr.html_url,
                repo: pr.repository_url.replace('https://api.github.com/repos/', ''),
                author: pr.user.login,
                authorAvatar: pr.user.avatar_url,
                state: pr.state,
                draft: pr.draft || false,
                createdAt: pr.created_at,
                updatedAt: pr.updated_at,
                labels: (pr.labels || []).map(l => ({ name: l.name, color: l.color }))
            }));
        } catch (e) {
            Logger.error('[GitHubAPI] fetchPullRequests failed:', e);
            throw e;
        }
    }
}
