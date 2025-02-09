// ==UserScript==
// @name         Azure DevOps Tools - Active pull requests alerts
// @namespace    https://dev.azure.com/
// @version      0.1
// @description  A badge and notification for active pull requests
// @author       Wessel Kroos
// @match        https://dev.azure.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const getHostPath = () => dataProviders?.data["ms.vss-web.page-data"]?.hostPath;
    const getProjectPath = () => dataProviders?.data["ms.vss-web.navigation-data"].routeValues.project;
    const getProjectId = () => dataProviders?.data["ms.vss-tfs-web.page-data"]?.project.id;

    const getRepositories = async () => {
        const response = await fetch(`${getHostPath()}${getProjectId()}/_apis/git/Repositories`);
        const json = await response.json();
        return json.value;
    };

    const getRepositoryPullrequests = async (repositoryId) => {
        const pullrequestsUrl = `${getHostPath()}${getProjectId()}/_apis/git/repositories/${repositoryId}/pullRequests?searchCriteria.status=1&%24skip=0&%24top=10`;
        const response = await fetch(pullrequestsUrl);
        const json = await response.json();
        return json.value;
    }

    const getProjectPullrequests = async () => {
        const repositories = await getRepositories();
        const repositoryIds = repositories.map(repository => repository.id);
        const pullrequests = [];
        for (const repositoryId of repositoryIds) {
            const repositoryPullrequests = await getRepositoryPullrequests(repositoryId);
            pullrequests.push(...repositoryPullrequests);
        }
        return pullrequests;
    };

    const updatePullrequestsBadge = () => {
        let badge = document.querySelector('#__bolt-ms-vss-code-web-code-hub-group-link .navigation-badge');
        if (!badge) {
            const container = document.querySelector('#__bolt-ms-vss-code-web-code-hub-group-link .navigation-icon');
            badge = document.createElement('span');
            badge.classList.add('navigation-badge');
            badge.style.position = 'absolute';
            badge.style.borderRadius = '6px';
            badge.style.color = '#fff';
            badge.style.top = '2px';
            badge.style.right = '2px';
            badge.style.fontSize = '10.75px';
            badge.style.padding = '0 3px';
            badge.style.lineHeight = '12px';
            badge.style.pointerEvents = 'none';
            container.prepend(badge);
        }

        const count = pullrequestsCache.length;
        badge.textContent = count || '';

        if (count === 0) {
            badge.style.backgroundColor = 'transparent';
        } else if (count === 1) {
            badge.style.backgroundColor = 'var(--status-success-text)';
        } else if (count <= 3) {
            badge.style.backgroundColor = 'var(--status-warning-text)';
        } else {
            badge.style.backgroundColor = 'var(--status-error-text)';
        }
    };

    const updatePullrequestsWarning = () => {
        const container = document.querySelector('[data-renderedregion="content-header"]');
        if (!container) return;

        let message = document.querySelector('[data-renderedregion="content-header"] .available-pullrequests-message');
        if (!message) {
            message = document.createElement('div');
            message.classList.add('available-pullrequests-message');
            message.style.backgroundColor = '6px';

            container.classList.add('flex-column');
            container.append(message);
        }

        const count = pullrequestsCache.length;
        let severity = 'info';
         if(count >= 4 || pullrequestsCache.some(pr => pr.mergeStatus !== 'succeeded')) {
            message.style.backgroundColor = 'var(--status-error-background)';
            severity = 'error';
        } else if (count >= 2) {
            message.style.backgroundColor = 'var(--status-warning-background)';
            severity = 'warning';
        } else if (count === 1) {
            message.style.backgroundColor = 'var(--status-success-background)';
        } else {
            message.style.backgroundColor = 'transparent';
        }

        const show = dataProviders?.data["ms.vss-web.navigation-data"]?.routeValues?.iteration && count !== 0;
        message.style.display = !show ? 'none' : '';
        if (!show) {
            message.innerHTML = '';
            return;
        }

        const hostPath = getHostPath();
        const projectPath = getProjectPath();
        const firstRepositoryPath = pullrequestsCache[0].repository.name;
        message.innerHTML = `
          <button class="global-message-banner flex-row flex-grow bolt-messagebar severity-${severity}" style="cursor: help">
            <span aria-hidden="true" class="bolt-messagebar-icon medium flex-noshrink fabric-icon ms-Icon--Warning" style="align-self: start; padding-top: 8px;"></span>
            <div class="bolt-messagebar-message flex-wrap flex-grow body-m word-break" style="padding: 6px 0; align-items: flex-start;" role="alert">
              ${count} Pull request${count > 1 ? 's' : ''}
              <a class="bolt-link" href="${hostPath}${projectPath}/_git/${firstRepositoryPath}/pullrequests?_a=active" style="margin-left: 10px" title="Go to Pull requests">
                <span aria-hidden="true" class="contributed-icon flex-noshrink fabric-icon ms-Icon--BranchPullRequest medium" style="transform: translateY(2px);"></span>
              </a>
              <div class="available-pullrequests-message__list flex-column">
                ${pullrequestsCache
                  .map(pr => {
                    const date = new Date(pr.creationDate);
                    const creationDateString = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                    const url = `${hostPath}${projectPath}/_git/${pr.repository.name}/pullrequest/${pr.pullRequestId}`;
                    return {
                      ...pr,
                      creationDateString,
                      url
                    };
                  })
                  .map(pr => `
                    <a class="bolt-link" style="margin-top: 6px; ${pr.mergeStatus !== 'succeeded' ? 'color: #f00;' : ''}" href="${pr.url}">
                      ${pr.creationDateString}
                      | ${pr.createdBy.displayName}
                      | ${pr.repository.name}
                      | ${pr.title}
                      ${pr.mergeStatus !== 'succeeded' ? `| <b>Merge: ${pr.mergeStatus}</b>` : ''}
                    </a>
                `).join('')}
              </div>
            </div>
          </button>
          <style>
            .available-pullrequests-message .global-message-banner {
              border: none !important;
              outline: none !important;
              width: 100%;
              text-align: left;
            }
            .available-pullrequests-message .available-pullrequests-message__list {
              transition: max-height .5s;
              max-height: 50vh;
              overflow-x: hidden;
              overflow-y: auto;
            }
            .available-pullrequests-message:not(:focus-within) .available-pullrequests-message__list {
              max-height: 0;
            }
          </style>
       `;
    };

    const updatePullrequestsInfo = () => {
        updatePullrequestsBadge();
        updatePullrequestsWarning();
    };

    let pullrequestsCache = [];
    const updatePullrequests = () => requestAnimationFrame(async () => {
        const hostPath = getHostPath();
        const projectId = getProjectId();
        if (!hostPath || !projectId) {
            console.warn('Cannot update pullrequests badge. No project selected.');
            return;
        }

        pullrequestsCache = await getProjectPullrequests();
        updatePullrequestsInfo();
    });


    // Display the pullrequests info on pageload
    updatePullrequests();

    // Schedule to update the pullrequests info very x minutes
    const refreshMinutes = 5;
    setInterval(updatePullrequests, refreshMinutes * 60 * 1000);

    // Restore the pullrequests info when the page component has been redrawn
    const observer = new MutationObserver(updatePullrequestsInfo);
    const page = document.querySelector('[data-componentregion="page"]');
    observer.observe(page, { subtree: false, childList: true });
})();
