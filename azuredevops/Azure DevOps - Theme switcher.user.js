// ==UserScript==
// @name         Azure DevOps - Theme switcher
// @namespace    http://tampermonkey.net/
// @version      2025-02-09
// @description  try to take over the world!
// @author       Automatically switches between the light and dark theme based on your theme in Windows
// @match        https://dev.azure.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=azure.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const Themes = {
        Light: 0,
        Dark: 1
    }

    class ThemeSwitcher {
        get themeSettingsHost() {
            return document.querySelector('.bolt-portal-host');
        }
        get openUserSettingsBtn() {
            return document.querySelector('.ms-Icon--PlayerSettings');
        }
        get openThemeSettingsBtn() {
            return document.querySelector('#__bolt-changeThemeLink-text');
        }
        get closeThemeSettingsBtn() {
            return document.querySelector('[id^="__bolt-close-button"]');
        }
        get enableThemeLightBtn() {
            return document.querySelector('#theme-ms-vss-web-vsts-theme');
        }
        get enableThemeDarkBtn() {
            return document.querySelector('#theme-ms-vss-web-vsts-theme-dark');
        }
        get enableThemeBtns() {
            return {
                [Themes.Light]: this.enableThemeLightBtn,
                [Themes.Dark]: this.enableThemeDarkBtn,
            };
        }

        get currentTheme() {
            const invertedNeutralColor = getComputedStyle(document.documentElement).getPropertyValue('--palette-neutral-100').replace(/ /g,'').trim();
            const invertedNeutralColorIsBlack = invertedNeutralColor === '0,0,0';
            return invertedNeutralColorIsBlack ? Themes.Light : Themes.Dark;
        }

        get preferredTheme() {
            if (window.matchMedia) {
                if(window.matchMedia('(prefers-color-scheme: dark)').matches){
                    return Themes.Dark;
                } else {
                    return Themes.Light;
                }
            }
            return Themes.Light;
        }

        constructor() {
            if(window.matchMedia) {
                const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
                colorSchemeQuery.addEventListener('change', this.check);
            }

            this.check();
        }

        check = () => {
            const preferredTheme = this.preferredTheme;
            if(this.currentTheme === preferredTheme) return;


            if(document.visibilityState !== 'visible') {
                window.addEventListener('visibilitychange', this.check)
                return;
            }

            window.removeEventListener('visibilitychange', this.check)
            this.switch(preferredTheme);
        }

        switch = async (theme) => {

            if(!this.enableThemeLightBtn && this.closeThemeSettingsBtn) {
                this.closeThemeSettingsBtn.click();
            }

            if(!this.enableThemeLightBtn) {
                if(!this.openThemeSettingsBtn) {
                    this.openUserSettingsBtn.click();
                }
                this.openThemeSettingsBtn.click();
            }

            let themeBtn = this.enableThemeBtns[theme];
            if(!themeBtn) {
                await new Promise(resolve => {
                    const observer = new MutationObserver(() => {
                        themeBtn = this.enableThemeBtns[theme];
                        if(!themeBtn) return;

                        observer.disconnect();
                        resolve();
                    });
                    observer.observe(this.themeSettingsHost, {
                        childList: true,
                        subtree: true
                    });
                });
            }
            themeBtn.click();

            this.closeThemeSettingsBtn.click();
        }
    }

    new ThemeSwitcher();
})();
