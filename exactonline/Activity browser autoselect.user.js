// ==UserScript==
// @name         ExactOnline - Activity browser autoselect
// @namespace    http://tampermonkey.net/
// @version      2025-02-09
// @description  None
// @author       Wessel K
// @match        https://start.exactonline.nl/docs/SysBrowser.aspx?Name=SelectableActivitiesWithBlocking*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=exactonline.nl
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';
    console.log('Autoselect in browser when single item');

    if(document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }


    // Click List tab
    const listTab = document.querySelector('#_tab_2');
    if(!listTab) return;

    if(listTab.parentNode.classList.contains('tabClear')) {
        const previousAction = JSON.parse(localStorage.getItem('browser-autoselect-previous') ?? '{}');
        const sameUrl = location.href === previousAction.url;
        const now = new Date().getTime();
        const recent = previousAction.date > now - 5000 && previousAction.date < now;
        if(sameUrl && recent) {
            console.log('Skipping autoselect to prevent an infinite loop');
            return;
        }

        localStorage.setItem('browser-autoselect-previous', JSON.stringify({ date: now, url: location.href }));
        listTab.click();
    }

    const items = document.querySelectorAll('#BrowseTable > tbody > tr');
    if(items.length > 1) return;

    if(items.length === 1) {
      console.log('Auto selected Activity:', items[0].textContent);
      items[0].click();
    }
})();
