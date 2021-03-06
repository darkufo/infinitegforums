var CCProfileRegex =
    /^(?:https:\/\/support\.google\.com)?\/s\/community\/forum\/[0-9]*\/user\/(?:[0-9]+)$/;
var CCRegex = /^https:\/\/support\.google\.com\/s\/community/;

const OP_FIRST_POST = 0;
const OP_OTHER_POSTS_READ = 1;
const OP_OTHER_POSTS_UNREAD = 2;

const OPClasses = {
  0: 'first-post',
  1: 'other-posts-read',
  2: 'other-posts-unread',
};

const OPi18n = {
  0: 'first_post',
  1: 'other_posts_read',
  2: 'other_posts_unread',
};

const indicatorTypes = ['numPosts', 'indicatorDot'];

// Filter used as a workaround to speed up the ViewForum request.
const FILTER_ALL_LANGUAGES =
    'lang:(ar | bg | ca | "zh-hk" | "zh-cn" | "zh-tw" | hr | cs | da | nl | en | "en-au" | "en-gb" | et | fil | fi | fr | de | el | iw | hi | hu | id | it | ja | ko | lv | lt | ms | no | pl | "pt-br" | "pt-pt" | ro | ru | sr | sk | sl | es | "es-419" | sv | th | tr | uk | vi)';

const numPostsForumArraysToSum = [3, 4];

function isElementInside(element, outerTag) {
  while (element !== null && ('tagName' in element)) {
    if (element.tagName == outerTag) return true;
    element = element.parentNode;
  }

  return false;
}

function escapeUsername(username) {
  var quoteRegex = /"/g;
  var commentRegex = /<!---->/g;
  return username.replace(quoteRegex, '\\"').replace(commentRegex, '');
}

function getPosts(query, forumId) {
  return fetch('https://support.google.com/s/community/api/ViewForum', {
           'credentials': 'include',
           'headers': {'content-type': 'text/plain; charset=utf-8'},
           'body': JSON.stringify({
             '1': forumId,
             '2': {
               '1': {
                 '2': 5,
               },
               '2': {
                 '1': 1,
                 '2': true,
               },
               '12': query,
             },
           }),
           'method': 'POST',
           'mode': 'cors',
         })
      .then(res => res.json());
}

function getProfile(userId, forumId) {
  return fetch('https://support.google.com/s/community/api/ViewUser', {
           'credentials': 'include',
           'headers': {'content-type': 'text/plain; charset=utf-8'},
           'body': JSON.stringify({
             '1': userId,
             '2': 0,
             '3': forumId,
           }),
           'method': 'POST',
           'mode': 'cors',
         })
      .then(res => res.json());
}

// Source:
// https://stackoverflow.com/questions/33063774/communication-from-an-injected-script-to-the-content-script-with-a-response
var contentScriptRequest = (function() {
  var requestId = 0;

  function sendRequest(data) {
    var id = requestId++;

    return new Promise(function(resolve, reject) {
      var listener = function(evt) {
        if (evt.source === window && evt.data && evt.data.prefix === 'TWPT' &&
            evt.data.requestId == id) {
          // Deregister self
          window.removeEventListener('message', listener);
          resolve(evt.data.data);
        }
      };

      window.addEventListener('message', listener);

      var payload = {data, id};

      window.dispatchEvent(
          new CustomEvent('TWPT_sendRequest', {detail: payload}));
    });
  }

  return {sendRequest: sendRequest};
})();

// Create profile indicator dot with a loading state, or return the numPosts
// badge if it is already created.
function createIndicatorDot(sourceNode, searchURL, options) {
  if (options.numPosts) return document.querySelector('.num-posts-indicator');
  var dotContainer = document.createElement('div');
  dotContainer.classList.add('profile-indicator', 'profile-indicator--loading');
  contentScriptRequest
      .sendRequest({
        'action': 'geti18nMessage',
        'msg': 'inject_profileindicator_loading'
      })
      .then(string => dotContainer.setAttribute('title', string));

  var dotLink = document.createElement('a');
  dotLink.href = searchURL;
  dotLink.innerText = '●';

  dotContainer.appendChild(dotLink);
  sourceNode.parentNode.appendChild(dotContainer);

  return dotContainer;
}

// Create badge indicating the number of posts with a loading state
function createNumPostsBadge(sourceNode, searchURL) {
  var link = document.createElement('a');
  link.href = searchURL;

  var numPostsContainer = document.createElement('div');
  numPostsContainer.classList.add(
      'num-posts-indicator', 'num-posts-indicator--loading');
  contentScriptRequest
      .sendRequest({
        'action': 'geti18nMessage',
        'msg': 'inject_profileindicator_loading'
      })
      .then(string => numPostsContainer.setAttribute('title', string));

  var numPostsSpan = document.createElement('span');
  numPostsSpan.classList.add('num-posts-indicator--num');

  numPostsContainer.appendChild(numPostsSpan);
  link.appendChild(numPostsContainer);
  sourceNode.parentNode.appendChild(link);
  return numPostsContainer;
}

// Get options and then handle all the indicators
function getOptionsAndHandleIndicators(sourceNode, isCC) {
  contentScriptRequest.sendRequest({'action': 'getProfileIndicatorOptions'})
      .then(options => handleIndicators(sourceNode, isCC, options));
}

// Handle the profile indicator dot
function handleIndicators(sourceNode, isCC, options) {
  var escapedUsername = escapeUsername(
      (isCC ? sourceNode.innerHTML :
              sourceNode.querySelector('span').innerHTML));

  if (isCC) {
    var threadLink = document.location.href;
  } else {
    var CCLink = document.getElementById('onebar-community-console');
    if (CCLink === null) {
      console.error(
          '[opindicator] The user is not a PE so the dot indicator cannot be shown in TW.');
      return;
    }
    var threadLink = CCLink.href;
  }

  var forumUrlSplit = threadLink.split('/forum/');
  if (forumUrlSplit.length < 2) {
    console.error('[opindicator] Can\'t get forum id.');
    return;
  }

  var forumId = forumUrlSplit[1].split('/')[0];

  var query = '(replier:"' + escapedUsername + '" | creator:"' +
      escapedUsername + '") ' + FILTER_ALL_LANGUAGES;
  var encodedQuery =
      encodeURIComponent(query + (isCC ? ' forum:' + forumId : ''));
  var searchURL =
      (isCC ? 'https://support.google.com/s/community/search/' +
               encodeURIComponent('query=' + encodedQuery) :
              document.location.pathname.split('/thread')[0] +
               '/threads?thread_filter=' + encodedQuery);

  if (options.numPosts) {
    var profileURL = new URL(sourceNode.href);
    var userId =
        profileURL.pathname.split(isCC ? 'user/' : 'profile/')[1].split('/')[0];

    var numPostsContainer = createNumPostsBadge(sourceNode, searchURL);

    getProfile(userId, forumId)
        .then(res => {
          if (!('1' in res) || !('2' in res[1])) {
            throw new Error('Unexpected profile response.');
            return;
          }

          contentScriptRequest.sendRequest({'action': 'getNumPostMonths'})
              .then(months => {
                if (!options.indicatorDot)
                  contentScriptRequest
                      .sendRequest({
                        'action': 'geti18nMessage',
                        'msg': 'inject_profileindicatoralt_numposts',
                        'placeholders': [months]
                      })
                      .then(
                          string =>
                              numPostsContainer.setAttribute('title', string));

                var numPosts = 0;

                for (const index of numPostsForumArraysToSum) {
                  if (!(index in res[1][2])) {
                    throw new Error('Unexpected profile response.');
                    return;
                  }

                  var i = 0;
                  for (const month of res[1][2][index].reverse()) {
                    if (i == months) break;
                    numPosts += month[3] || 0;
                    ++i;
                  }
                }

                numPostsContainer.classList.remove(
                    'num-posts-indicator--loading');
                numPostsContainer.querySelector('span').classList.remove(
                    'num-posts-indicator--num--loading');
                numPostsContainer.querySelector('span').textContent = numPosts;
              })
              .catch(
                  err => console.error('[opindicator] Unexpected error.', err));
        })
        .catch(
            err => console.error(
                '[opindicator] Unexpected error. Couldn\'t load profile.',
                err));
    ;
  }

  if (options.indicatorDot) {
    var dotContainer = createIndicatorDot(sourceNode, searchURL, options);

    // Query threads in order to see what state the indicator should be in
    getPosts(query, forumId)
        .then(res => {
          if (!('1' in res) || !('2' in res['1'])) {
            throw new Error('Unexpected thread list response.');
            return;
          }

          // Current thread ID
          var threadUrlSplit = threadLink.split('/thread/');
          if (threadUrlSplit.length < 2)
            throw new Error('Can\'t get thread id.');

          var currId = threadUrlSplit[1].split('/')[0];

          var OPStatus = OP_FIRST_POST;

          for (const thread of res['1']['2']) {
            var id = thread['2']['1']['1'] || undefined;
            if (id === undefined || id == currId) continue;

            var isRead = thread['6'] || false;
            if (isRead)
              OPStatus = Math.max(OP_OTHER_POSTS_READ, OPStatus);
            else
              OPStatus = Math.max(OP_OTHER_POSTS_UNREAD, OPStatus);
          }

          var dotContainerPrefix =
              (options.numPosts ? 'num-posts-indicator' : 'profile-indicator');

          if (!options.numPosts)
            dotContainer.classList.remove(dotContainerPrefix + '--loading');
          dotContainer.classList.add(
              dotContainerPrefix + '--' + OPClasses[OPStatus]);
          contentScriptRequest
              .sendRequest({
                'action': 'geti18nMessage',
                'msg': 'inject_profileindicator_' + OPi18n[OPStatus]
              })
              .then(string => dotContainer.setAttribute('title', string));
        })
        .catch(
            err => console.error(
                '[opindicator] Unexpected error. Couldn\'t load recent posts.',
                err));
  }
}

if (CCRegex.test(location.href)) {
  // We are in the Community Console
  function mutationCallback(mutationList, observer) {
    mutationList.forEach((mutation) => {
      if (mutation.type == 'childList') {
        mutation.addedNodes.forEach(function(node) {
          if (node.tagName == 'A' && ('href' in node) &&
              CCProfileRegex.test(node.href) &&
              isElementInside(node, 'EC-QUESTION') && ('children' in node) &&
              node.children.length == 0) {
            getOptionsAndHandleIndicators(node, true);
          }
        });
      }
    });
  };

  var observerOptions = {
    childList: true,
    subtree: true,
  }

  mutationObserver = new MutationObserver(mutationCallback);
  mutationObserver.observe(
      document.querySelector('.scrollable-content'), observerOptions);
} else {
  // We are in TW
  var node =
      document.querySelector('.thread-question a.user-info-display-name');
  if (node !== null)
    getOptionsAndHandleIndicators(node, false);
  else
    console.error('[opindicator] Couldn\'t find username.');
}
