We're working on a Chrome extension for tracking progress in online videos, currently focused on YouTube. The PRD is @video-bookmarks-prd.md . So far we've implemented the first feature, the manual bookmarks.

I'd like to implement the auto-bookmark feature as described in the @video-bookmarks-prd.md file.

Here are some of my thoughts on how to implement it:

* This should build on the manual bookmark feature
* The major difference is that the auto bookmark feature will not have the in-player bookmark toggle, and will automatically bookmark the video when it is detected to be playing on a supported site
* There should be a toggle in the extension popup to enable/disable auto-bookmarks
* While we will probably support other sites besides YouTube in the future, for now we only support YouTube, so the toggle can be global for all YouTube videos
* The auto-bookmark feature should be disabled by default

Please give me a proposed design for the auto-bookmark feature. Write it to docs/brainstorming/auto-bookmarks.md
