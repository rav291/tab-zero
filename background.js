// The toolbar icon opens the collector page, and the page does all the work.
// A service worker is shut down after ~30 s idle; an open tab is not, so a
// 30-tab sweep can't die halfway.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'collect.html' }))
