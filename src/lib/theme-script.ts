const KEY = "sfe-theme";

/** runs before paint (inlined in <head>) so there's no flash. paper is the default. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})();`;
