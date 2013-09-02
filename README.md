video-ads-test
==============

A test site to demonstrate a bug in [Google IMA HTML5 SDK](https://developers.google.com/interactive-media-ads/docs/sdks/html5/v3/) in iOS 6.

The main script that loads the ads can be found [here](/js/SmpHtml5Ads.js). The index.html file just sets up the
necessary objects, and creates an iframe, that the player is loaded in.

The same bug is demonstrated when viewing the player in an iframe [index.html](index.html) and looking at the iframe source directly [video-iframe.html](video-iframe.html).

After pressing play, the video ad element loads in the page but the video ad does not play.