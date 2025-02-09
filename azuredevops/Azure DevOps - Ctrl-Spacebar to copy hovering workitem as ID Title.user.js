// ==UserScript==
// @name         Azure DevOps - Ctrl+Spacebar to copy hovering workitem as "ID Title"
// @namespace    http://tampermonkey.net/
// @version      2025-02-09
// @description  
// @author       Wessel K
// @match        https://dev.azure.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=azure.com
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    if(document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }

    const getIdFromHref = (elem) => {
        if (!elem.href) return;
        return /[^/]*$/.exec(elem.href)[0];
    }

    // Selector path:
    // - Item
    //   - Id
    //   - Title
    const selectors = [
        // Boards
        {
            // Boards > Work items
            item: '.work-items-hub-row',
            id: '.work-item-simple-cell',
            title: '.work-item-title-link'
        },
        {
            // Boards > Board
            item: '.board-tile',
            id: '.id',
            title: '.title'
        },
        {
            // Boards > Backlogs
            // Boards > Sprints > Backlog
            // Boards > Queries > Results
            // Boards > Queries > Editor > Results
            item: '[role="row"]',
            id: {
                selector: '.work-item-title-link',
                getter: getIdFromHref
            },
            title: '.work-item-title-link'
        },
        {
            // Boards > Sprints > Taskboard
            item: (target) => {
                let item = target.closest('.taskboard-row');
                if (!item) return;

                // Collapsed row
                if (item.classList.contains('taskboard-row-summary')) {
                    item = item.previousElementSibling;
                }
                if (!item.classList.contains('taskboard-content-row')) return;

                return item.querySelector('.taskboard-parent');
            },
            id: '.id-title-container .id',
            title: '.id-title-container .title'
        },
        // Repos & Work item
        {
            // Repos > Commits > Commit > Work item(s) tooltip > Work item
            // Repos > Pull requests > Pull request > Work Items > Work item
            // Work item > Related Work > Work Item
            item: (target) => target.closest('.la-item')?.querySelector('.la-artifact-data .la-primary-data'),
            id: {
                selector: 'a',
                getter: getIdFromHref
            },
            title: 'a'
        },
        // Pipelines > Pipeline > Build > Work items
        {
            item: '.bolt-list-row',
            id: {
                selector: (item) => item,
                getter: getIdFromHref
            },
            title: '.body-m'
        },
        // Work item
        {
            // Work item
            item: '.work-item-form',
            id: '.work-item-form-id > span',
            title: {
                selector: '.work-item-form-title input',
                getter: (titleElem) => titleElem.value
            }
            // Work item > Related Work --> Repos & Work item
        },
    ];

    const getItemInfoFromTarget = (selector, target) => {
        const itemElem = (typeof selector.item !== 'function') ? target.closest(selector.item) : selector.item(target);
        if (!itemElem) return;

        const idSelector = selector.id.selector || selector.id;
        const idElem = (typeof idSelector !== 'function') ? itemElem.querySelector(idSelector) : idSelector(itemElem);
        if (!idElem) return;

        const titleSelector = selector.title.selector || selector.title;
        const titleElem = (typeof titleSelector !== 'function') ? itemElem.querySelector(titleSelector) : titleSelector(itemElem);
        if (!titleElem) return;

        return {
            itemElem,
            idElem,
            titleElem,
        }
    };

    const showOverlay = (target, isError = false) => {
        const overlay = document.createElement('div');
        overlay.classList.add('azure-devops-powertoolt-overlay');
        overlay.addEventListener('animationend', () => {
            overlay.remove();
            overlay.classList.remove('azure-devops-powertoolt-overlay--error');
            overlay.style = '';
        });

        if (target) {
            const titleRect = target.getBoundingClientRect();
            overlay.style.left = `${titleRect.left}px`;
            overlay.style.top = `${titleRect.top + window.scrollY}px`;
            overlay.style.width = `${titleRect.width}px`;
            overlay.style.height = `${titleRect.height}px`;
        }
        if (isError) {
            overlay.classList.add('azure-devops-powertoolt-overlay--error');
        }

        document.body.appendChild(overlay);
    };

    const getDescriptionFromItem = (selector, item) => {
        const id = (selector.id.getter) ? selector.id.getter(item.idElem) : item.idElem.textContent;
        const title = (selector.title.getter) ? selector.title.getter(item.titleElem) : item.titleElem.textContent;
        return `${id} ${title}`;
    };

    const getDescriptionFromTarget = (target) => {
        for(const selector of selectors) {
            const item = getItemInfoFromTarget(selector, target);
            if (!item) continue;

            showOverlay(item.titleElem);
            return getDescriptionFromItem(selector, item);
        }

        const elems = document.getElementsByTagName('*');
        let items = [];
        for(const elem of elems) {
            for(const selector of selectors) {
                const item = getItemInfoFromTarget(selector, elem);
                if (!item) continue;

                items.push(item);
            }
        }

        items = items.filter((item, index, self) => {
            return self.findIndex(selfItem => selfItem.itemElem === item.itemElem) === index;
        });
        for(const item of items) {
            showOverlay(item.titleElem, true);
        }
    };

    // Track the cursor position

    let mousePosition = { x: -1, y: -1 };

    window.addEventListener('mousemove', (e) => {
        mousePosition = { x: e.clientX, y: e.clientY };
    });

    // Get `${id} ${title}` and save it to the clipboard
    const onSpaceKeyDownHandler = async (e) => {
        if (!e.ctrlKey || e.key !== ' ') return;

        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        const target = document.elementFromPoint(mousePosition.x, mousePosition.y);
        // console.log('target:', target);
        if (!target) return;

        const description = getDescriptionFromTarget(target);
        if (!description) return;

        console.log(`work item description copied: "${description}"`);
        if (description) {
            await navigator.clipboard.writeText(description);
        }
    };

    const onControlKeyUpHandler = (e) => {
        if(e.key !== 'Control') return;

        onKeyTarget.removeEventListener('keydown', onSpaceKeyDownHandler);
        onKeyTarget.removeEventListener('keyup', onControlKeyUpHandler);
        window.removeEventListener('keyup', onControlKeyUpHandler);
    };

    let onKeyTarget;
    window.addEventListener('keydown', (e) => {
        if (!e.target || e.key === ' ' || !e.ctrlKey) return;

        onKeyTarget = e.target;
        onKeyTarget.addEventListener('keydown', onSpaceKeyDownHandler);
        onKeyTarget.addEventListener('keyup', onControlKeyUpHandler);
        window.addEventListener('keyup', onControlKeyUpHandler);
    });

    const style = document.createElement('style');
    style.textContent = `
.azure-devops-powertoolt-overlay {
  position: absolute;
  z-index: 10000000;
  left: 0;
  top: 0;
  background: rgba(0, 123, 255, .5);
  outline: 2px solid rgb(0, 123, 255);
  pointer-events: none;
  animation: azure-devops-powertoolt-overlay--fade-out .5s .5s both;
}

.azure-devops-powertoolt-overlay--error {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 0, .5);
  outline: 2px solid rgb(255, 255, 0);
}

@keyframes azure-devops-powertoolt-overlay--fade-out {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
`;
    document.head.appendChild(style);
})();
