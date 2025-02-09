// ==UserScript==
// @name         ExactOnline - Week transactions - Quick search & Autofill & Autofocus
// @namespace    http://tampermonkey.net/
// @version      2025-02-09
// @description  None
// @author       Wessel K
// @match        https://start.exactonline.nl/docs/ProWeekTransactions.aspx*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=exactonline.nl
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';
    console.log('Speeding up ExactOnline');

    if(document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }

    // Search input suggestions
    if(globalThis.getSysInputTimeoutGradientValue) {
        globalThis.getSysInputTimeoutGradientValue = new Function(`return ${
            getSysInputTimeoutGradientValue.toString()
            .replace('.min || 600;', '.min || 200;')
            .replace('.max || 300;', '.max || 10;')
        }`)();
    }

    // Entered project
    if(globalThis.OnChangeExpandableTimeProject) {
        const func = `${OnChangeExpandableTimeProject.toString()
        .replace('\n}', '')
        .replace('\n', '\nawait new Promise(resolve => setTimeout(resolve, 1));\n')
        }}`;

        globalThis.OnChangeExpandableTimeProject = new Function(`return async ${func}`)();
    }

    // Save hour type value
    document.addEventListener('keyup', async (e) => {
        const elem = e.target;
        if(!elem?.id?.match?.(/^mtx_r[0-9]+_Item_alt$/)) return;

        localStorage.setItem('autofillDefaultHourType', elem.value);
    });

    const autoFillType = async (type) => {
        if(!type.value) {
            type.focus();
            const defaultValue = await localStorage.getItem('autofillDefaultHourType');
            if(!defaultValue) {
                console.log('No previous "hour type" value has been saved yet.');
                return;
            }
            console.log('auto fill Type field', defaultValue);
            type.value = defaultValue;
            type.click();
            await new Promise(resolve => setTimeout(resolve, 1));
            const event = new InputEvent("change", { });
            Object.defineProperty(event, 'target', {writable: false, value: type});
            type.onchange(event);
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        if(type.value) {
            console.log('Type field already has value. Focus to note.', type.value);
            const row = type.closest('tr');
            const note = row.querySelector('#colNotes textarea');
            note?.focus();
        }
    };

    // Auto open browser or focus next
    let openedBrowser = false;
    document.addEventListener('focusin', async () => {
        let alreadyOpen = window.parent?.document?.querySelector?.('.ui-widget-overlay');
        if(alreadyOpen) return;

        await new Promise(resolve => setTimeout(resolve, 1));
        const elem = document.activeElement;
        if(!elem?.id?.match?.(/^pmtx_r[0-9]+_ProjectWBS$/)) {
            return;
        }

        alreadyOpen = window.parent?.document?.querySelector?.('.ui-widget-overlay');
        if(alreadyOpen) return;

        if(!elem.nextSibling.value) {
            if(openedBrowser) return;
            const alreadyOpen = window.parent?.document?.querySelector?.('.ui-widget-overlay');
            if(alreadyOpen) {
                return;
            }
            console.log('auto open Activity browser');
            openedBrowser = true;
            //elem.removeEventListener('click', onBrowseActivityMouseUp, { capture: true });
            //elem.addEventListener('click', onBrowseActivityMouseUp, { capture: true });
            elem.click();
            await new Promise(resolve => setTimeout(resolve, 1));

            elem.addEventListener('focusout', async (e) => {
                const alreadyOpen = window.parent?.document?.querySelector?.('.ui-widget-overlay');
                if(alreadyOpen || !openedBrowser) return;
                openedBrowser = false;
            }, { once: true });
        } else {
            openedBrowser = false;
            console.log('auto skip Activity field');

            const account = elem.closest('#colAccount');
            const type = account.querySelector('[id$="_Item_alt"]');
            autoFillType(type);
        }
    });

    document.addEventListener('focusin', async (e) => {
        if(!e.target?.id?.match?.(/^mtx_r[0-9]+_Item_alt$/)) {
            return;
        }

        if(!(
            e.relatedTarget?.id?.match?.(/^pmtx_r[0-9]+_ProjectWBS$/) ||
            e.relatedTarget?.id?.match?.(/^mtx_r[0-9]+_Project_alt$/)
        )) return;

        await new Promise(resolve => setTimeout(resolve, 1));
        autoFillType(e.target);
    });

    // Autoremember last filled day
    let lastDayColumn = 1;
    document.addEventListener('focusout', async (e) => {
        const elem = e.target;
        const dayIndex = elem?.id?.match?.(/^mtx_r[0-9]{1,}_c([0-9])_Quantity$/)?.[1];
        if(!dayIndex || !elem.value) {
            const wasNote = elem.parentNode?.id === 'colNotes' && elem.id.endsWith('_Notes');
            if(!wasNote) return;
            const nextDayIndex = e.relatedTarget?.id?.match?.(/^mtx_r[0-9]{1,}_c([0-9])_Quantity$/)?.[1];
            if(!nextDayIndex) return;
            autoFocusLastDay(elem);
            return;
        }

        lastDayColumn = parseInt(dayIndex, 10);
        console.log('Last filled day:', lastDayColumn);
    });

    // Autofocus last filled day
    const autoFocusLastDay = async (elemInRow) => {
        const row = elemInRow.closest('tr');
        const day = row.querySelector(`[id^="mtx_r"][id$="_c${lastDayColumn}_Quantity"]`);
        if(!day) return;
        day.focus();
        return day;
    };

    // Auto paste workitem
    let lastAutoFilledNote;
    const autoFillNote = async () => {
        const elem = document.activeElement;
        const isNote = elem.parentNode?.id === 'colNotes' && elem.id.endsWith('_Notes');
        if(!isNote || elem.disabled || elem.readOnly || elem.value) return;

        let text = await (async () => {
            const clipboardContents = await navigator.clipboard.read();
            const lastItem = clipboardContents[0];
            if (!lastItem.types.includes("text/plain")) return;
            const blob = await lastItem.getType("text/plain");
            return await blob.text();
        })();
        if(!text) {
            lastAutoFilledNote = undefined;
            return;
        }

        const workItemInfo = text.match(/^[A-z ]+ ([0-9]{2,}): /);
        if(workItemInfo) {
            text = `${workItemInfo[1]} ${text.substring(workItemInfo[0].length)}`;
        }
        if(!text.match(/^[0-9]{2,} /)) {
            lastAutoFilledNote = undefined;
            return;
        }
        if(lastAutoFilledNote === text) return;

        elem.value = text;
        lastAutoFilledNote = text;

        const day = await autoFocusLastDay(elem);
        if(!day) return;

        // Regain day focus after autofill on click
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                elem.removeEventListener('mouseup', onMouseup, { once: true });
                resolve();
            }, 2000);
            const onMouseup = async () => {
                clearTimeout(timeout);
                await new Promise(resolve => setTimeout(resolve, 1));
                resolve();
            };
            elem.addEventListener('mouseup', onMouseup, { once: true });
        });
        if(document.activeElement === day) return;

        day.focus();
    };

    document.addEventListener('focusin', async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        autoFillNote();
    });

    // Auto paste workitem on tab visible
    window.addEventListener('visibilitychange', async () =>{
        if(document.visibilityState !== 'visible' || !document.activeElement) return;
        await new Promise(resolve => setTimeout(resolve, 1));
        autoFillNote();
    }, false);
})();
