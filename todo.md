# Backend
[x] Fix current issue while running dev and potentially production.
[] Remove comments feature entirely (prior work was done, verify if it is complete and make a git commit locally)
[] Migrate to bun completely.
[] Check if uploaded video is already a webm/vp9/av1 video, if so, move it to vault and add a re-encode option to actions menu.
# Frontend
[] Redo color schemes for light mode. (low priority, skip unless specified)
# Admin Panel
[] In job queue tab, remove type colums (because all jobs are process-videos). Change Video ID to Video, Video column should have video name as primary and the video id in small text below it. video name should not be hardcoded to what it was when the transcode was done. It should pull from uid so that it always uses current video name, even if its renamed.
[] Job queue now stores history of transcodes, its not removed when complete, remove Transcode from history timeline. On complete it shows the resultant file size, original->resultant size and reduction% instead of the job status
[] All tabs should be paged, max items per page 50. Convert all non paged pages to it to - like how manage tab has a table that scrolls instead of having content in page and scrolls (which is bad for mobile).
[] History no longer stores edits. add a new tab in manage modal (after edit and metadata tab.) ALL history of that file is shown there (upload, transcode, edit).
[] In video modal- change metadata tab. Remove  Original Filename, File Name, Status, Media Type, Uploaded at and Updated at. Add type (e.g. `x265/mkv` or `vp9/webm`) and rename Recorded at to date.
[] Settings tab remove Cache to be its own setting
[] Settings Tab - Add ffmpeg params as an option to settings (give a text box that lets you define the command e.g. `ffmpeg -c:v ... -c:a ...`, everything other than -i -y and output file).
[] Settings Tab add an option to manage tags (Like rename a misnamed tag, delete a tag everywhere etc)
