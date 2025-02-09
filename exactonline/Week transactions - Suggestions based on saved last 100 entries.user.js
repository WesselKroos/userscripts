// ==UserScript==
// @name         ExactOnline - Week transactions - Suggestions based on saved last 100 entries
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

    if(document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }

    console.log('Suggestions in week view based on the last saved 100 entries');

    const inputNames = [
        // // "Deleted",
        // "Account",
        // "Account_alt",
        // "Account_ref",
        // "Account_refHidden",
        "Project",
        "Project_alt",
        "Project_ref",
        // "Project_refHidden",
        "ProjectWBS",
        "ProjectWBS_ref", //Visual
        // "ProjectWBS_refHidden",
        "Item",
        "Item_alt", // Visual
        // "Item_ref",
        // "Item_refHidden",
        // // "Progress_databarRef",
        // // "ProjectWBSExists",
        // // "c1$Quantity",
        // // "c2$Quantity",
        // // "c3$Quantity",
        // // "c4$Quantity",
        // // "c5$Quantity",
        // // "c6$Quantity",
        // // "IsCorrectedTimeTransaction",
        // // "ProjectId",
        // // "ProjectManager"
    ];

    const getRow = (elem) => {
        const row = elem.closest('tr[id^="mtx_r"]');
        if (!row) return;

        const match = row.id.match(/mtx_r(?<index>[0-9]+)/);
        if (!match) return;
        const index = parseInt(match.groups.index, 10);
        // const account = row.querySelector(`[name="mtx_r${index}$Account_alt"]`);
        // const project = row.querySelector(`[name="mtx_r${index}$Project_alt"]`);
        // const projectWBS = row.querySelector(`[name="mtx_r${index}$ProjectWBS"]`);
        // const item = row.querySelector(`[name="mtx_r${index}$Item_alt"]`);
        // const notes = row.querySelector(`[name="mtx_r${index}$Notes"]`);

        const inputs = {
            ...inputNames.reduce((inputs, name) => {
                inputs[name] = row.querySelector(`[id="mtx_r${index}_${name}"]`);
                return inputs;
            }, {})
        };

        return {
            row,
            index,
            inputs
            // account,
            // project,
            // projectWBS,
            // item,
            // notes
        };
    };

    const getRowValues = (row) => {
        const values = Object.keys(row.inputs).reduce((values, name) => {
            values[name] = row.inputs[name].value;
            return values;
        }, {});

        const parts = values.Project_alt.split(';');
        values.Project_alt = parts[0];
        if(parts.length === 2) {
            values.ProjectWBS_ref = parts[1];
        }
        // console.log('row values', values, parts, values.Project_alt, values.ProjectWBS_ref);

        return values;
    };

    const data = JSON.parse(localStorage.getItem('autofill-data')) || [];

    const saveDataValues = (values) => {
        // console.log('data1:', data);
        const index = data.findIndex(item => (
            // item.values.Account_alt === values.Account_alt &&
            item.values.Project_alt === values.Project_alt &&
            item.values.ProjectWBS === values.ProjectWBS &&
            item.values.Item_alt === values.Item_alt
        ));

        if (index === -1) {
            data.push({
                date: new Date().getTime(),
                values
            });
        } else {
            const item = data[index];
            const now = new Date().getTime();
            const unchanged = now - 5 * 60 * 1000 < item.date && JSON.stringify(item.values) === JSON.stringify(values);
            if(unchanged) {
                // console.log('unchanged', item, now, values);
                return;
            }
            item.date = now;
            item.values = values;
        }

        localStorage.setItem('autofill-data', JSON.stringify(data));
    };

    const stringScore = (sWord, word, fuzziness) => {
        // If the string is equal to the word, perfect match.
        if (sWord === word) { return 1; }

        //if it's not a perfect match and is empty return 0
        if (word === "") { return 0; }

        var runningScore = 0,
            charScore,
            finalScore,
            string = sWord,
            lString = string.toLowerCase(),
            strLength = string.length,
            lWord = word.toLowerCase(),
            wordLength = word.length,
            idxOf,
            startAt = 0,
            fuzzies = 1,
            fuzzyFactor,
            i;

        // Cache fuzzyFactor for speed increase
        if (fuzziness) { fuzzyFactor = 1 - fuzziness; }

        // Walk through word and add up scores.
        // Code duplication occurs to prevent checking fuzziness inside for loop
        if (fuzziness) {
            for (i = 0; i < wordLength; i+=1) {

                // Find next first case-insensitive match of a character.
                idxOf = lString.indexOf(lWord[i], startAt);

                if (idxOf === -1) {
                    fuzzies += fuzzyFactor;
                } else {
                    if (startAt === idxOf) {
                        // Consecutive letter & start-of-string Bonus
                        charScore = 0.7;
                    } else {
                        charScore = 0.1;

                        // Acronym Bonus
                        // Weighing Logic: Typing the first character of an acronym is as if you
                        // preceded it with two perfect character matches.
                        if (string[idxOf - 1] === ' ') { charScore += 0.8; }
                    }

                    // Same case bonus.
                    if (string[idxOf] === word[i]) { charScore += 0.1; }

                    // Update scores and startAt position for next round of indexOf
                    runningScore += charScore;
                    startAt = idxOf + 1;
                }
            }
        } else {
            for (i = 0; i < wordLength; i+=1) {
                idxOf = lString.indexOf(lWord[i], startAt);
                if (-1 === idxOf) { return 0; }

                if (startAt === idxOf) {
                    charScore = 0.7;
                } else {
                    charScore = 0.1;
                    if (string[idxOf - 1] === ' ') { charScore += 0.8; }
                }
                if (string[idxOf] === word[i]) { charScore += 0.1; }
                runningScore += charScore;
                startAt = idxOf + 1;
            }
        }

        // Reduce penalty for longer strings.
        finalScore = 0.5 * (runningScore / strLength    + runningScore / wordLength) / fuzzies;

        if ((lWord[0] === lString[0]) && (finalScore < 0.85)) {
            finalScore += 0.15;
        }

        return finalScore;
    };

    const getValueScore = (a = '', b = '') => {
        a = a.toUpperCase();
        b = b.toUpperCase();
        return stringScore(a, b);
    };

    const getScore = (a, b) => {
        let score = 0;
        // score += getValueScore(a.Account_alt, b.Account_alt);
        // score += getValueScore(a.Project_alt, b.Project_alt);
        score += getValueScore(a.Project_ref, b.Project_alt);
        score += getValueScore(a.ProjectWBS_ref, b.ProjectWBS_ref);
        // score += getValueScore(a.Item_alt, b.Item_alt);
        // console.log('score:', a, b, score);
        return score;
    };

    const getDataItems = (values) => {
        const sortedData = data
        .map((item, index) => ({
            score: getScore(item.values, values),
            ...item,
            dataIndex: index
        }))
        .sort((a, b) => a.score - b.score) // Values
        .filter(item => item.score)
        .sort((a, b) => (a.score !== b.score) ? 0 : (a.date - b.date)); // Date

        // console.log('values to sort on:', values);
        // console.log('sorted data:', sortedData);
        return sortedData.reverse();
    };

    let ignoreInput = false;
    let autofillDropdown;
    const autofillDropdownPaddingWidth = 12
    const updateAutofillDropdown = (input) => {
        if(scheduledRemoveAutofillDropdown) {
            clearTimeout(scheduledRemoveAutofillDropdown);
            scheduledRemoveAutofillDropdown = undefined;
        }
        // console.log('updateAutofillDropdown', input);

        const row = getRow(input);
        if (!row) {
            removeAutofillDropdown();
            return;
        }
        // console.log('keydown row', autofillDropdown.row)

        const values = getRowValues(row);

        // console.log('new values:', values);
        // console.log('autofill row:', autofillDropdown.values);

        // console.log('data:', data);
        const items = getDataItems(values);

        if(autofillDropdown && JSON.stringify(autofillDropdown.items) === JSON.stringify(items)) return;

        if(!items.length) {
            removeAutofillDropdown();
            return;
        }
        // console.log('data item:', item);
        // console.log('new items:', autofillDropdown.items);

        if(!autofillDropdown) {
            autofillDropdown = document.createElement('div');
            autofillDropdown.classList.add('exact-online-powertools-autofill-dropdown');
            // autofillDropdown.addEventListener('mousedown', () => {
            //   console.log('mousedown')
            //   if(scheduledRemoveAutofillDropdown) {
            //     console.log('cancelled scheduledRemoveAutofillDropdown')
            //     clearTimeout(scheduledRemoveAutofillDropdown);
            //     scheduledRemoveAutofillDropdown = undefined;
            //   };
            // });

            const header = document.createElement('header');
            header.classList.add('exact-online-powertools-autofill-dropdown__header');
            header.innerHTML = `
        <div class="exact-online-powertools-autofill-dropdown__header-title">Autofill suggestions</div>
        <div class="exact-online-powertools-autofill-dropdown__header-hint">Select first item with CTRL + SPACEBAR</div>
      `;
            autofillDropdown.appendChild(header);

            const ulScroller = document.createElement('div');
            ulScroller.classList.add('exact-online-powertools-autofill-dropdown__list-scroller');
            autofillDropdown.appendChild(ulScroller);

            const ul = document.createElement('ul');
            ul.classList.add('exact-online-powertools-autofill-dropdown__list');
            ulScroller.appendChild(ul);
            autofillDropdown.ul = ul;

            document.body.appendChild(autofillDropdown);

            input.addEventListener('focusout', removeAutofillDropdown);
            autofillDropdown.input = input;

            window.addEventListener('resize', updateAutofillDropdownSize);
        }

        autofillDropdown.row = row;
        autofillDropdown.values = values;
        autofillDropdown.items = items;
        // console.log('autofillDropdown items', autofillDropdown.items);

        autofillDropdown.ul.innerHTML = '';
        autofillDropdown.items.toReversed().forEach(item => {
            const li = document.createElement('li');
            li.classList.add('exact-online-powertools-autofill-dropdown__item');
            li.addEventListener('click', (e) => {
                //Todo: Fix case in which
                e.preventDefault();
                if(scheduledRemoveAutofillDropdown) {
                    clearTimeout(scheduledRemoveAutofillDropdown);
                    scheduledRemoveAutofillDropdown = undefined;
                };

                // console.log('selected item', item);
                autofillDropdown.items = [item];
                autofillDropdown.input.focus();
                ignoreInput = true;
                document.execCommand('insertText', false, ' ');
                ignoreInput = false;
                autofillDropdown.input.click();

                // console.log('autofill', autofillDropdown.items);
                autofill();
                // console.log('remove from selected');
                removeAutofillDropdown();
            });
            [item.values.Project_ref, item.values.ProjectWBS_ref, item.values.Item_alt]
                .forEach(field => {
                const fieldDiv = document.createElement('div');
                fieldDiv.classList.add('exact-online-powertools-autofill-dropdown__field');
                fieldDiv.textContent = field;
                li.appendChild(fieldDiv);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('exact-online-powertools-autofill-dropdown__field');
            deleteBtn.classList.add('exact-online-powertools-autofill-dropdown__field--delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                removeDataItem(item);

                autofillDropdown.input.focus();
                updateAutofillDropdown(autofillDropdown.input);
                if(!scheduledRemoveAutofillDropdown) return;

                clearTimeout(scheduledRemoveAutofillDropdown);
                scheduledRemoveAutofillDropdown = undefined
            });
            li.appendChild(deleteBtn);
            // .join('|');
            // JSON.stringify(item);
            autofillDropdown.ul.appendChild(li);
        });

        updateAutofillDropdownSize();
        const ulScroller = autofillDropdown.lastChild;
        ulScroller.scrollTo({ top: ulScroller.scrollHeight });
    };

    // Delay for a click on an item in the dropdown
    let scheduledRemoveAutofillDropdown;
    const removeAutofillDropdown = (e) => {
        if(scheduledRemoveAutofillDropdown) return;

        scheduledRemoveAutofillDropdown = setTimeout(() => {
            scheduledRemoveAutofillDropdown = undefined;
            if(!autofillDropdown) return;

            // console.log('removeAutofillDropdown', document.activeElement, e);
            autofillDropdown.input.removeEventListener('focusout', removeAutofillDropdown);
            window.removeEventListener('resize', updateAutofillDropdownSize);
            autofillDropdown.remove();

            autofillDropdown = undefined;
            // previousSearchPopup = undefined;
        }, 500);
        // Todo: Find a more reliable way. A click in the popup that takes longer than 500 ms is to slow
    };

    const updateAutofillDropdownSize = () => {
        if(!autofillDropdown) return;

        const autofillDropdownRect = autofillDropdown.getBoundingClientRect();
        const inputRect = autofillDropdown.input.getBoundingClientRect();
        // if(searchPopup) {
        //   // console.log('searchPopup', searchPopup)
        //   const searchPopupRect = searchPopup.getBoundingClientRect();
        //   autofillDropdown.style.top = `${inputRect.top - 5 + window.scrollY - autofillDropdownRect.height}px`; // `${inputRect.top + inputRect.height + window.scrollY}px`;
        //   // autofillDropdown.style.left = `${searchPopupRect.left + searchPopupRect.width - 1}px`;
        //   autofillDropdown.style.left = `${searchPopupRect.left}px`;
        //   autofillDropdown.style.maxWidth = `calc(100vw - ${searchPopupRect.left + searchPopupRect.width + autofillDropdownPaddingWidth}px)`;
        //   return;
        // }
        // console.log('no searchPopup')

        // console.log('input rect', inputRect);
        autofillDropdown.style.top = `${inputRect.top - 7 + window.scrollY - autofillDropdownRect.height}px`; // `${inputRect.top + inputRect.height + window.scrollY}px`;
        autofillDropdown.style.left = `${inputRect.left}px`;
        autofillDropdown.style.maxWidth = `calc(100vw - ${inputRect.left + autofillDropdownPaddingWidth}px)`;
    };

    let searchPopup;
    const observer = new MutationObserver((mutationsList, observer) => {
        if(!autofillDropdown) {
            searchPopup = undefined;
            return;
        }

        if(searchPopup && !searchPopup.isConnected) {
            searchPopup = undefined;
        }
        if(!searchPopup) {
            searchPopup = document.body.querySelector(':scope > #cntPopupSearch:not([style*="display: none"])');
        }

        setTimeout(() => {
            updateAutofillDropdownSize();
        }, 0);

        // console.log('searchPopup and autofillDropdown', searchPopup, autofillDropdown);
    });
    observer.observe(document.body, {
        childList: true,
        subtree: false
    });

    const saveRow = (elem) => {
        const row = getRow(elem);
        if (!row) return;

        // console.log('blur row', row)
        const values = getRowValues(row);
        // console.log('blur getvalues', values);
        if (!values.Project || !values.Item
            // || !values.ProjectWBS
           ) return;
        // console.log('blur values', values)

        saveDataValues(values);
        // console.log('data:', data);
    };

    const init = () => {
        const mtx = document.querySelector('#mtx');
        if(!mtx) return;

        mtx.addEventListener('focusin', (e) => {
            if (!e.target.id.match(/mtx_r[0-9]+\_Project_alt/)) return;
            e.target.placeholder = 'Project;Activity';

            const eventListener = (e) => {
                e.target.placeholder = '';
                e.target.removeEventListener('blur', eventListener);
            };
            e.target.addEventListener('blur', eventListener);
        });

        mtx.addEventListener('keydown', (e) => {
            if (!e.target.id.match(/mtx_r[0-9]+\_Project_alt/)) return;
            if (!e.ctrlKey || e.key !== ' ') return;

            // Trigger click to hide the search popup
            e.target.click();

            autofill();

            // // Delay to let the browser update the e.target.value
            // setTimeout(() => {

            //   updateAutofillDropdown(e.target);


            //   removeAutofillDropdown();
            //   // console.log('keydown Space')
            // }, 0)
        });
        mtx.addEventListener('input', (e) => {
            if (!e.target.id.match(/mtx_r[0-9]+\_Project_alt/)) return;
            if (ignoreInput) return;

            updateAutofillDropdown(e.target);
        });

        const rows = document.querySelectorAll('tr[id^="mtx_r"] .RowNumber');
        rows.forEach(elem => {
            saveRow(elem);
            // console.log('blur', e.target.id)
        });

        const mutationObserver = new MutationObserver(function onRowClassMutation(mutationsList) {
            for(const mutation of mutationsList) {
                if(mutation.target?.localName !== 'tr') continue;
                // console.log('save row mutation:', mutation.target);
                saveRow(mutation.target);
            }
        });
        mutationObserver.observe(mtx.querySelector(':scope > tbody'), {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
        });
    };
    init();

    const removeDataItem = (item) => {
        // const index = item.dataIndex;
        // const removedItem = data.splice(index, 1);
        localStorage.setItem('autofill-data', JSON.stringify(data));
    };

    const autofill = async () => {
        const row = autofillDropdown.row;
        const values = autofillDropdown.values;
        const item = ( autofillDropdown.items.length) ?  autofillDropdown.items[0] : undefined;
        if(!item) {
            // console.log('AUTOFILL | No matching previous record found for values:', values);
            return;
        }

        const items = Object.keys(item.values)
        .map((name, index) => ({
            name,
            value: item.values[name],
            input: row.inputs[name]
        }))
        .filter(item => item.input);

        for(let i = 0; i < items.length; i++) {
            const { name, value, input } = items[i];
            if(name === 'Project') {
                continue;
            }

            // console.log('autofilling', input, value);
            input.value = value;

            // Trigger change to validate the Project field before Activity field
            if(name === 'ProjectWBS') {
                const event = new Event('change');
                input.dispatchEvent(event);
                // console.log('autofilling complete ProjectWBS');
            }

            // Trigger change to validate the Hour type field
            if(name === 'Item_alt') {
                input.click();
                await new Promise(resolve => setTimeout(resolve, 1));
                const event = new InputEvent("change", { });
                Object.defineProperty(event, 'target', {writable: false, value: input});
                input.onchange(event);
                // console.log('autofilling complete Item_alt');
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }

        // Ensure trigger blur to validate the Activity field
        // console.log('autofilling Project_alt 2 before', document.activeElement, row.inputs.Project_alt);
        if(document.activeElement === row.inputs.Project_alt) {
            const projectWBSButton = row.row.querySelector('button[id^="pmtx_r"][id$="_ProjectWBS"]');
            const refocusTextarea = async () => {
                // console.log('refocus note after focus on hour type');
                await new Promise(resolve => setTimeout(resolve, 1));
                row.row.querySelector('textarea').focus();
                row.inputs.Item_alt.removeEventListener('focus', refocusTextarea, { once: true });
                projectWBSButton.removeEventListener('focus', refocusTextarea, { once: true });
            };
            projectWBSButton.addEventListener('focus', refocusTextarea, { once: true });
            row.inputs.Item_alt.addEventListener('focus', refocusTextarea, { once: true });
            setTimeout(() => {
                projectWBSButton.removeEventListener('focus', refocusTextarea, { once: true });
                row.inputs.Item_alt.removeEventListener('focus', refocusTextarea, { once: true });
                // console.log('autofilling Project_alt 2 before', document.activeElement);
            }, 2000);
        }

        await new Promise(resolve => setTimeout(resolve, 1));

        row.row.querySelector('textarea').focus();
        // console.log('autofilling note focus 1 after', document.activeElement);

        const color = document.querySelector(`[id="mtx_r${row.index}_Project_ref"]`).style.color;
        if(color === 'red') {
            console.log('AUTOFILL | Project/Activity expired. Deleting record from history:', values);
            removeDataItem(item);

            // Clear invalid values
            row.inputs.Project.value = '';
            row.inputs.Project_ref.value = '';
            row.inputs.Project_alt.value = '';
            row.inputs.ProjectWBS.value = '';
            row.inputs.ProjectWBS_ref.value = '';
            row.inputs.Item.value = '';
            row.inputs.Item_alt.value = '';

            // Re-type text
            row.inputs.Project_alt.focus();
            document.execCommand('insertText', false, values.Project_alt);
            updateAutofillDropdown(row.inputs.Project_alt);
            autofill();

            return;
        }
    };


    const style = document.createElement('style');
    style.textContent = `
.exact-online-powertools-autofill-dropdown {
  position: absolute;
  z-index: 10000000;
  left: 0;
  top: 0;
  max-width: calc(100vw - 250px);
  background: #f0f7ff;
  margin-top: 4px;
  border: 1px solid #a0b8cf;
  box-shadow: 2px 3px 3px 0 #777;
}
.exact-online-powertools-autofill-dropdown__header {
  display: flex;
  justify-content: space-between;
  background: #a0b8cf;
  padding: 4px 10px;
  overflow: hidden;
}
.exact-online-powertools-autofill-dropdown__header-title {
  flex-shrink: 0;
  font-weight: bold;
  white-space: nowrap;
}
.exact-online-powertools-autofill-dropdown__header-hint {
  font-size: 11px;
  font-style: italic;
  white-space: nowrap;
  margin-left: 10px;
}
.exact-online-powertools-autofill-dropdown__list-scroller {
  max-height: 350px;
  overflow-y: auto;
  padding: 4px 5px;
}
.exact-online-powertools-autofill-dropdown__list {
  display: table;
}
.exact-online-powertools-autofill-dropdown__item {
  display: table-row;
}
.exact-online-powertools-autofill-dropdown__list:not(:hover) .exact-online-powertools-autofill-dropdown__item:last-child {
  background: #cfdfef;
}
.exact-online-powertools-autofill-dropdown__item:hover {
  background: #cfdfef;
}
.exact-online-powertools-autofill-dropdown__field {
  display: table-cell;
  padding: 4px 5px;
  cursor: pointer;
}
.exact-online-powertools-autofill-dropdown__field--delete-btn {
  margin: -1px 5px 1px;
  border: 1px solid #59595b;
  border-radius: 3px;
  background: none;
  padding: 0 4px;
}
.exact-online-powertools-autofill-dropdown__field--delete-btn::before {
  content: "x";
  display: block;
  color: #59595b;
  font-weight: bold;
  transform: scaleX(1.2);
}
`;
    document.head.appendChild(style);
})();
