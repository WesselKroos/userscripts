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
            .replace('.min || 600;', '.min || 1;')
            .replace('.max || 300;', '.max || 0;')
        }`)();
    }

    // Entered project
    if(globalThis.OnChangeExpandableTimeProject) {
        const func = `${OnChangeExpandableTimeProject.toString()
        .replace('\n}', '')
        .replaceAll('\n', '\nawait new Promise(resolve => setTimeout(resolve, 1));\n')
        }}`;

        globalThis.OnChangeExpandableTimeProject = new Function(`return async ${func}`)();
    }

    // Auto open browser or focus next
    let openedBrowser = false;
    //const onBrowseActivityMouseUp = (e) => {
    //    const alreadyOpen = window.parent?.document?.querySelector?.('.ui-widget-overlay');
    //    console.log('alreadyOpen mouseup', alreadyOpen);
    //    if(!alreadyOpen) return;
    //    //e.stopPropagation();
    //};


    document.addEventListener('focusin', async () => {
        let alreadyOpen = window.parent?.document?.querySelector?.('.ui-widget-overlay');
        if(alreadyOpen) return;

        await new Promise(resolve => setTimeout(resolve, 1));
        const elem = document.activeElement;
        if(!elem.id.endsWith('_ProjectWBS')) {
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

            const account = elem.closest('#colAccount');
            const type = account.querySelector('[id$="_Item_alt"]');
            if(!type.value) {
                console.log('auto fill Type field');
                type.focus();
                type.value = 'DEV';
                type.click();
                await new Promise(resolve => setTimeout(resolve, 1));
                const event = new InputEvent("change", { });
                Object.defineProperty(event, 'target', {writable: false, value: type});
                type.onchange(event);
                await new Promise(resolve => setTimeout(resolve, 1));
            }

            if(type.value) {
                console.log('auto skip Activity field');
                const row = elem.closest('tr');
                const note = row.querySelector('#colNotes textarea');
                note?.focus();
            }
        }
    });

    // Auto paste workitem
    let lastAutoFilledNote;
    const autoFillNote = async () => {
        const elem = document.activeElement;
        if(elem.parentNode?.id !== 'colNotes' || !elem.id.endsWith('_Notes') || elem.disabled || elem.readOnly || elem.value) return;

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

        if(text.match(/^Product backlog item #[0-9]{2,} /)) {
            text = text.substring('Product backlog item #'.length);
        }
        if(!text.match(/^[0-9]{2,} /)) {
            lastAutoFilledNote = undefined;
            return;
        }
        if(lastAutoFilledNote === text) return;

        elem.value = text;
        lastAutoFilledNote = text;

        // Autofocus last filled day
        const row = elem.closest('tr');
        const day = row.querySelector(`[id^="mtx_r"][id$="_c${lastDayColumn}_Quantity"]`);
        if(!day) return;
        day.focus();
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                day.removeEventListener('blur', onBlur, { once: true });
                resolve();
            }, 1000);
            const onBlur = async () => {
                clearTimeout(timeout);
                await new Promise(resolve => setTimeout(resolve, 1));
                resolve();
            };
            day.addEventListener('blur', onBlur, { once: true });
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

    // Autoremember last filled day
    let lastDayColumn = 1;
    document.addEventListener('focusout', async (e) => {
        //await new Promise(resolve => setTimeout(resolve, 1));
        const elem = e.target;
        const dayIndex = elem?.id?.match?.(/^mtx_r[0-9]{1,}_c([0-9])_Quantity$/)?.[1];
        if(!dayIndex || !elem.value) return;

        lastDayColumn = parseInt(dayIndex, 10);
        console.log('Last filled day:', lastDayColumn);
    });
})();
