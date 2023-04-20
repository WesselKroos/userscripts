// ==UserScript==
// @name         YouTube layout - Fixes all kind of performance problems
// @namespace    https://dev.azure.com/
// @version      0.1
// @description  Several fixes for performance problems in the YouTube layout
// @author       Wessel Kroos
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// ==/UserScript==


// Generic function used in some features
const mutationsHasAddedNodes = mutations => mutations.find(mutation => (
    mutation.addedNodes?.length && 
    [...mutation.addedNodes].find(addedNode => addedNode.tagName && addedNode.tagName !== 'svg') // ignore text nodes
));


// Throttle window resizes
(function () {
    let scheduledResize;
    let executingResize = false;
    const handleResize = (e) => {
        executingResize = true
        window.dispatchEvent(new Event('resize'))
    }
    window.addEventListener('yt-action', function (e) {
        if (e.detail?.actionName === 'yt-window-resized' && !scheduledResize && !executingResize) {
            scheduledResize = setTimeout(handleResize, 500)
        }
        if (
            e.target.tagName === 'YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER' ||
            e.detail?.actionName === 'yt-user-activity' ||
            // e.detail?.actionName === 'yt-close-popup-action' ||
            (e.detail?.actionName === 'yt-window-resized' && !executingResize)
        ) {
            e.stopImmediatePropagation();
            return
        }
        if (executingResize) {
            executingResize = false
            scheduledResize = undefined
        }
    }, true);
})();


// Fix repeated layout invalidations caused by setAttribute when the attribute already equals the value
(function() {
    const originalSetAttribute = HTMLElement.prototype.setAttribute;
    HTMLElement.prototype.setAttribute = function(...args) {
        if(this.getAttribute(args[0]) === args[1]) return;

        // console.log(...args)
        originalSetAttribute.bind(this)(...args);
    };
})();


// Remember computed styles to prevent layout invalidations caused by repeated calls to getComputedStyle
(function() {
    const getComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(...args) {
        // console.log('getComputedStyle', ...args)
        if(
            args[0].id === 'item-scroller' || // live chat messages list
            args[0].id === 'items' || // scrollable list
            args[0].tagName === 'TP-YT-PAPER-DIALOG' // Save to playlist dialog
        )
            return getComputedStyle(...args);
        // const computedStyle = getComputedStyle(...args);
        // console.log('getComputedStyle', args[0]) // args, computedStyle, args[0].style);
        // return computedStyle;
        return args[0].style
    }
})();


// Remember the player size to prevent layout invalidations caused by repeated calls to getPlayerSize
(function() {
    const resizeObserver = new ResizeObserver(async (entries, observer) => {
        for(const entry of entries) {
            // console.log('resized', entry.borderBoxSize[0]);

            const elem = entry.target;
            elem.cachedGetBoundingClientRect = undefined;
            elem.cachedClientWidth = Math.round(entry.borderBoxSize[0].inlineSize);
            elem.cachedClientHeight = Math.round(entry.borderBoxSize[0].blockSize);

            if(!Object.getOwnPropertyDescriptor(elem, 'originalGetBoundingClientRect')) {
                // Properties are not yet defined

                // Because of a lot of calls to .ytp-progress-bar-container
                Object.defineProperty(elem, 'originalGetBoundingClientRect', {
                    value: elem.getBoundingClientRect
                });
                elem.getBoundingClientRect = function() {
                    if(elem.cachedGetBoundingClientRect === undefined) {
                        elem.cachedGetBoundingClientRect = elem.originalGetBoundingClientRect();
                    }
                    return elem.cachedGetBoundingClientRect;
                };

                // Because of a lot of calls to .html5-video-player
                Object.defineProperty(elem, 'clientWidth', {
                    get() {
                        if(elem.cachedClientWidth === undefined) {
                            const rect = elem.getBoundingClientRect()
                            elem.cachedClientWidth = Math.round(rect.width)
                            elem.cachedClientHeight = Math.round(rect.height)
                        }
                        return elem.cachedClientWidth;
                    }
                });

                // Because of a lot of calls to .html5-video-player
                Object.defineProperty(elem, 'clientHeight', {
                    get() {
                        if(elem.cachedClientHeight === undefined) {
                            const rect = elem.getBoundingClientRect()
                            elem.cachedClientWidth = Math.round(rect.width)
                            elem.cachedClientHeight = Math.round(rect.height)
                        }
                        return elem.cachedClientHeight;
                    }
                });
            }
        }

        
        const videoPlayer = document.querySelector('.html5-video-player');
        if(!videoPlayer) return;

        videoPlayer.setInternalSize();
        videoPlayer.setSize();
    })

    const fixedElems = []
    const mutationObserver = new MutationObserver((mutations) => {
        if(!mutationsHasAddedNodes(mutations)) return
        
        let newElems = []
        for(const mutation of mutations) {
            const addedNodes = [...mutation.addedNodes]
            for(const addedNode of addedNodes) {
                if(addedNode.classList?.contains && (addedNode.classList.contains('html5-video-player') || addedNode.classList.contains('ytp-progress-bar-container')))
                    newElems.push(addedNode)
                if(addedNode.querySelectorAll) {
                    const newAddedNodeElems = [...addedNode.querySelectorAll('.html5-video-player, .ytp-progress-bar-container')]
                        .filter(elem => !fixedElems.includes(elem))
                    if(newAddedNodeElems.length)
                        newElems = newElems.concat(newAddedNodeElems);
                }
            }
        }
        for(const elem of newElems) {
            resizeObserver.observe(elem)
            // console.log('observing', elem)
            fixedElems.push(elem)
        }
    })
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    // window.addEventListener('resize', () => {
    //     // console.log('window resized')
    //     for(const elem of fixedElems) {
    //         elem.cachedClientWidth = undefined
    //         elem.cachedClientHeight = undefined
    //     }
    // })
})();


// Throttle repeated layout invalidations caused by player timeline updates
// by rounding out the numbers in style transformations
(function() {
    const cachedStyleRulesKeys = []
    const cachedStyleRules = {}
    const getStyleRules = elem => {
        const style = elem.getAttribute('style');
        if(!style) {
            return [];
        }

        if(!cachedStyleRules[style]) {
            // console.log('cache miss', cachedStyleRulesKeys.length, transform);
            cachedStyleRules[style] = style
                .split(';')
                .map(p => p
                    .trim())
                .filter(_ => _)
                .map(rule => rule
                    .split(':')
                    .map(p => p
                        .trim()));
            cachedStyleRulesKeys.push(style)
            if(cachedStyleRulesKeys.length > 500) {
                for(const key of cachedStyleRulesKeys.splice(0, 100)) {
                    delete cachedStyleRules[key]
                }
            }
        } else {
            // console.log('cache hit', cachedStyleRulesKeys.length, style);
        }

        return cachedStyleRules[style];
    };

    const cachedTransformPartsKeys = []
    const cachedTransformParts = {}
    const getTransformParts = transform => {
        if(!cachedTransformParts[transform]) {
            // console.log('cache miss', cachedTransformPartsKeys.length, transform);
            cachedTransformParts[transform] = transform
                .split(/[ (,)]/)
                .map(p => p
                    .trim())
                .filter(_ => _);
            cachedTransformPartsKeys.push(transform)
            if(cachedTransformPartsKeys.length > 500) {
                for(const key of cachedTransformPartsKeys.splice(0, 100)) {
                    delete cachedTransformParts[key]
                }
            }
        } else {
            // console.log('cache hit', cachedTransformPartsKeys.length, transform);
        }
        return cachedTransformParts[transform];
    }
    
    const cachedRoundedValuesKeys = []
    const cachedRoundedValues = {}
    const getRoundedValue = (value, cache) => {
        if(!cachedRoundedValues[value]) {
            // console.log('cache miss', cachedRoundedValuesKeys.length, value);
            let rValue = value;
            if(value.endsWith('px')) {
                rValue = Math.round(
                    Number(value
                        .replace('px','')));
                if(rValue !== 0) rValue += 'px';
            } else if(value.endsWith('%')) {
                rValue = Math.round(
                    Number(value
                        .replace('%','')));
                if(rValue !== 0) rValue += '%';
            } else if(!Number.isNaN(
                Number(value))
            ) {
                rValue = Math.round(
                    Number(value) * 10000)
                    / 10000;
            } else {
                rValue = value.toLowerCase() 
            }
            cachedRoundedValues[value] = rValue;

            cachedRoundedValuesKeys.push(value)
            if(cachedRoundedValuesKeys.length > 500) {
                for(const key of cachedRoundedValuesKeys.splice(0, 100)) {
                    delete cachedRoundedValues[key]
                }
            }
        } else {
            // console.log('cache hit', cachedRoundedValuesKeys.length, value);
        }
        return cachedRoundedValues[value];
    }

    const isDifferent = (oldPart, part) => {
        if(oldPart == undefined || part == undefined) {
            return oldPart == part;
        }

        const rOldPart = getRoundedValue(oldPart, true);
        const rPart = getRoundedValue(part, false);
        // console.log('isDifferent?', rOldPart != rPart, '|', rOldPart, rPart, '|', oldPart, part);
        return rOldPart != rPart;
    };

    const fixElem = (elem) => {
        Object.defineProperty(elem.style, 'transform', {
            get() {
                const rule = getStyleRules(elem)
                    .find(rule => rule[0] === 'transform');
                const transform = (rule?.length > 1) ? (rule[1] || '') : '';
                // console.log('get transform', transform);
                return transform;
            },
            set(value) {
                if(!value) value = '';
                value = value.trim();

                const oldRules = getStyleRules(elem)
                    // .filter(rule => rule.length > 1 && rule[0]);
                // console.log('set transform | oldRules', oldRules, elem.getAttribute('style').trim());
                const oldRule = oldRules
                    .find(rule => rule[0] === 'transform');
                const oldValue = (oldRule?.length > 1) ? (oldRule[1] || '') : ''
                // console.log('set transform | oldValue', oldValue);
                
                if(oldValue === value) {
                    // console.log('transform is already', oldValue);
                    return;
                }

                const oldParts = getTransformParts(oldValue);
                const parts = getTransformParts(value);
                if(oldParts.length === parts.length) {
                    const hasADifferentPart = oldParts.find((oldPart, i) => 
                        isDifferent(oldPart, parts[i]));
                    // if(!hasADifferentPart)
                    //     console.log('rounded the same', oldParts, parts);
                    if(!hasADifferentPart) return
                }

                // const originalValues = originalValue.split(/[ ,()]/).filter(_ => _);
                // const values = value.split(/[ ,()]/).filter(_ => _);
                // if(originalValues.length === values.length) {
                //     console.log('transform values are rounded equal', transform, value);
                // }
                
                let indexOfOldRule = oldRules.findIndex(rule => rule[0] === 'transform');
                const newRules = [...oldRules];
                if(indexOfOldRule === -1) {
                    newRules.push(['transform', value]);
                } else {
                    newRules.splice(indexOfOldRule, 1, ['transform', value]);
                }
                // console.log('newRules', newRules);

                const newStyle = newRules.map(rule => rule
                    .join(': '))
                    .join('; ');
                // console.log('newStyle', newStyle);
                
                // console.log('style', rOldPart, rPart, oldPart, part);
                elem.setAttribute('style', newStyle);
            }
        });

        Object.defineProperty(elem.style, 'left', {
            get() {
                const rule = getStyleRules(elem)
                    .find(rule => rule[0] === 'left');
                const left = (rule?.length > 1) ? (rule[1] || '') : '';
                // console.log('get left', left);
                return left;
            },
            set(value) {
                if(!value) value = '';
                value = value.trim();

                const oldRules = getStyleRules(elem)
                    // .filter(rule => rule.length > 1 && rule[0]);
                // console.log('set left | oldRules', oldRules, elem.getAttribute('style').trim());
                const oldRule = oldRules
                    .find(rule => rule[0] === 'left');
                const oldValue = (oldRule?.length > 1) ? (oldRule[1] || '') : ''
                // console.log('set left | oldValue', oldValue);
                
                if(oldValue === value) {
                    // console.log('left is already', oldValue);
                    return;
                }

                // if(!hasADifferentPart)
                //     console.log('rounded the same', oldParts, parts);
                const valuesAreDifferent = isDifferent(oldValue, value)
                if(!valuesAreDifferent) {
                    // console.log('left set to same', oldValue, value);
                    return;
                }

                // const originalValues = originalValue.split(/[ ,()]/).filter(_ => _);
                // const values = value.split(/[ ,()]/).filter(_ => _);
                // if(originalValues.length === values.length) {
                //     console.log('left values are rounded equal', left, value);
                // }
                

                const newRules = oldRules
                    .filter(rule => rule[0] !== 'left');
                newRules.push(['left', value]);
                // console.log('newRules', newRules);

                const newStyle = newRules.map(rule => rule
                    .join(': '))
                    .join('; ');
                // console.log('newStyle', newStyle);
                elem.setAttribute('style', newStyle);
            }
        });
    };

    const fixedElems = []
    const mutationObserver = new MutationObserver((mutations) => {
        if(!mutationsHasAddedNodes(mutations)) return

        // console.log(mutations.filter(mutation => mutation.addedNodes?.length))

        const newElems = [...document.querySelectorAll(`
            .html5-video-player .ytp-scrubber-container,
            .html5-video-player .ytp-play-progress,
            .html5-video-player .ytp-load-progress,
            .html5-video-player .ytp-hover-progress
        `)].filter(elem => !fixedElems.includes(elem))
        // if(newElems.length)
        //     console.log('observing', newElems)

        for(const elem of newElems) {
            fixElem(elem);
            fixedElems.push(elem);
            // console.log('observing', elem)
        }
    })
    mutationObserver.observe(document.body, { childList: true, subtree: true })
})();


// Prevent element size recalculations of invisible elements
(function () {
    const styleElem = document.createElement('style');
    styleElem.id = 'fix-layout-performance-problems-style';
    styleElem.textContent = `
        #player-container {
          contain-intrinsic-size: auto 1px auto calc(100vh - 82px - 138px);
        }
        primary-inner > #info {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 110px;
        }
        primary-inner > #meta {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 180px;
        }
        primary-inner > #ticket-shelf {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 140px;
        }
        ytd-comment-thread-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 100px;
          contain: content;
        }
        ytd-playlist-panel-video-renderer {
            content-visibility: auto;
            contain-intrinsic-size: auto 1px auto 62px;
            contain: strict;
        }
        ytd-playlist-video-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 101px;
        }
        yt-related-chip-cloud-renderer {
          display: block;
          height: 51px;
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 51px;
        }
        ytd-compact-video-renderer,
        ytd-compact-radio-renderer,
        ytd-compact-playlist-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 98px;
          contain: strict;
        }
        ytd-grid-video-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 239px;
        }
        yt-live-chat-text-message-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 32px;
        }
        yt-live-chat-paid-message-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 32px;
        }
        yt-live-chat-membership-item-renderer {
          content-visibility: auto;
          contain-intrinsic-size: auto 1px auto 32px;
        }

        #microformat,
        #panels.ytd-watch-flexy, /* Engagement panels above the secondary column */
        yt-interaction,
        ytd-thumbnail-overlay-now-playing-renderer.ytd-thumbnail,
        #buttons.ytd-compact-video-renderer,
        #additional-metadata-line.ytd-video-meta-block,
        tp-yt-paper-tooltip.ytd-channel-name
        {
          display: none;
        }
    `;
    document.head.appendChild(styleElem);
})();
