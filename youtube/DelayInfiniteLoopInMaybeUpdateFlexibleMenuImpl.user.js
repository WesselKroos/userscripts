// ==UserScript==
// @name         YouTube - Delay infinite loop in maybeUpdateFlexibleMenuImpl
// @namespace    http://tampermonkey.net/
// @version      2024-08-23
// @description  Delay infinite loop in maybeUpdateFlexibleMenuImpl
// @author       Wessel Kroos
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // console.log('Prevent infinite loop');

    window.maybeUpdateFlexibleMenuImplMaxCounters = {};
    let globalIndex = 0;
    const fixYtdMenuRenderer = (ytdMenuRenderer) => {
        globalIndex++;
        const index = globalIndex;
        //console.log('Preventing infinite loop', ytdMenuRenderer, ytdMenuRenderer.polymerController.maybeUpdateFlexibleMenuImpl);

        const originalMaybeUpdateFlexibleMenuImpl = ytdMenuRenderer.polymerController.maybeUpdateFlexibleMenuImpl.bind(ytdMenuRenderer.polymerController);
        const previousCallTimes = [];
        let timeout;
        let timeoutWarning;
        ytdMenuRenderer.polymerController.maybeUpdateFlexibleMenuImpl = async function() {
            if(timeout) return;
            //console.log('maybeUpdateFlexibleMenuImpl');

            const now = performance.now();
            previousCallTimes.push(now);
            for(const time of previousCallTimes.filter(time => time < now - 1000)) {
                previousCallTimes.splice(previousCallTimes.indexOf(time), 1);
            }

            if(
                window.maybeUpdateFlexibleMenuImplMaxCounters[index] === undefined ||
                window.maybeUpdateFlexibleMenuImplMaxCounters[index] < previousCallTimes.length
            ) {
                 window.maybeUpdateFlexibleMenuImplMaxCounters[index] = previousCallTimes.length;
            }

            if(previousCallTimes.length > 10) {
                console.log(`!!!!!!!!!!!!!!! Called maybeUpdateFlexibleMenuImpl[${index}] ${previousCallTimes.length} times in a second. Delaying by a second...`);
                debugger;

                if(!timeoutWarning) {
                    const el = document.createElement('div');
                    el.style.position = 'fixed';
                    el.style.bottom = '0px';
                    el.style.right = '0px';
                    el.style.zIndex = 10000;
                    el.style.width = '200px';
                    el.style.height = '50px';
                    el.style.background = '#f00';
                    el.style.fontSize = '20px';
                    el.style.color = '#fff';
                    el.style.textAlign = 'center';
                    el.style.pointerEvents = 'none';
                    el.style.overflow = 'hidden';
                    el.style.opacity = .33;
                    el.innerText = `${index}: ${previousCallTimes.length}`;
                    timeoutWarning = el;
                }
                document.body.appendChild(timeoutWarning);

                await new Promise(resolve => {
                    timeout = setTimeout(resolve, 1000);
                });
                timeout = undefined;

                timeoutWarning.remove();
            }

            return originalMaybeUpdateFlexibleMenuImpl();
        };

        //console.log('Preventing maybeUpdateFlexibleMenuImpl infinite loop on', ytdMenuRenderer);
    };

    const fixedYtdMenuRenderers = [];
    const observer = new MutationObserver(() => {
        const ytdMenuRenderers = [...document.querySelectorAll('ytd-menu-renderer')]
            .filter(el => !fixedYtdMenuRenderers.includes(el));
        if(!ytdMenuRenderers.length) return;

        for(const el of ytdMenuRenderers) {
            fixYtdMenuRenderer(el);
            fixedYtdMenuRenderers.push(el);
        }
    });
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
    });
})();
