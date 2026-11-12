# Plant Care user guide

For version 0.17.1, as of 12 November 2026.

Plant Care is a phone app for one grower and two sites in Cap Bon: the walled backyard at home and the farm at borgdanet, Menzel Bouzelfa. You photograph a plant and Claude names it and writes a care profile for these sites. The app turns that profile into dated tasks, a morning notification and a daily round on the Today screen. Chapters 1 to 14 cover using the app, chapter 15 covers setup and administration for the owner, and chapter 16 lists what the app does not do.

In this guide, **bold** words are things you tap, named as the English screens name them, and "quoted" words are what the app shows. In French the screens use their French names (Settings → Language).

## Contents

1. [What the app does](#1-what-the-app-does)
2. [Words used in this guide](#2-words-used-in-this-guide)
3. [Getting started](#3-getting-started)
4. [Today: the daily round](#4-today-the-daily-round)
5. [Adding a plant with Capture](#5-adding-a-plant-with-capture)
6. [A plant's page](#6-a-plants-page)
7. [Plants, the map and tree tags](#7-plants-the-map-and-tree-tags)
8. [The species library](#8-the-species-library)
9. [Check before planting](#9-check-before-planting)
10. [Settings](#10-settings)
11. [How the reminders work](#11-how-the-reminders-work)
12. [Without a connection](#12-without-a-connection)
13. [What the Claude calls cost](#13-what-the-claude-calls-cost)
14. [Messages and what to do](#14-messages-and-what-to-do)
15. [Setup and administration](#15-setup-and-administration)
16. [Limits](#16-limits)

## 1. What the app does

- **The daily round.** Today lists what is late, due today, open as a window or due in the next six days at both sites. Each site shows its work due now by kind of task (water, prune, harvest…), with the coming days below. A kind folds away for the day and can be sent as a list to whoever does the work. Each task has Done, Skip and Snooze, and Done and Skip have an Undo. A zone's waterings due together share one card, and so do a zone's plants that share a window job, such as a harvest; a site's due waterings close in one tap.
- **Morning notifications.** Each morning between 06:00 and 07:00 Tunis time, each phone that turned reminders on gets one notification for each site with something due. A weather notification comes first when an alert or a rain skip applies.
- **Identification.** Capture sends a photo to Claude, which names up to three candidates. Each comes with its confidence, the visible evidence and the names in English, French and Tunisian Arabic.
- **Species profiles.** Claude writes one profile per species for Cap Bon: site fit, water, sun and heat, salinity, frost and chill, a care calendar, pests and diseases, companions, uses and toxicity. You confirm it and can correct any part by hand, and your edits survive a rewrite.
- **Tasks from the calendar.** The care calendar becomes dated tasks 90 days ahead, matched to each plant's age. Waterings come every few days with their litres. Pruning, feeding, mulching, harvest, scouting, propagation and protection come as windows that stay open over their months.
- **Health.** Diagnose sends a photo of a problem with your note. Claude answers with likely causes, checks to do on site, an organic treatment, prevention, an urgency and a date for a follow-up photo, which becomes a reminder. Treatments are logged from the diagnosis. Each key term carries the word said in Tunisian (derja), in Arabic letters, for you to say to a worker or a supplier; you correct a word once and the app keeps yours. The same words show on a plant's Needs, Calendar, Health and Guild tabs and on the species page.
- **Questions.** Ask Claude holds a conversation about one plant, drawing on its profile, tasks, diagnoses, zone neighbours and the weather. Each answer is kept in the plant's journal.
- **Check before planting.** Before you buy a plant, Claude weighs it against the saline well, the lime soil, the climate, the animals, the space and the pests. It gives a verdict, where and when to plant, what to look for at the nursery and better choices.
- **Weather.** The local forecast (Open-Meteo) shows on Today, with alerts for heat, sirocco, frost, gales and heavy rain. The morning run skips waterings after rain, and Today shows the hours that suit spraying when a task or a diagnosis calls for a spray.
- **Journal and care log.** Each plant keeps a dated journal of photos, tasks done or skipped, diagnoses, treatments and questions. Care done without a reminder can be logged, and a one-off reminder set.
- **Map and tree tags.** The plants show on a map with pins coloured by what is due. Each plant can be placed from the phone's GPS or by hand, and a sheet of QR tags can be printed so that the phone's camera opens a tree's page.
- **Settings.** English or French, a list of zones per site, the rain-skip threshold, and CSV exports of the plants and the tasks.
- **Private.** Only the owner's account can read or write the data or use the Claude calls.

Only Capture, a profile rewrite, Diagnose, Ask Claude, Check before planting and Get derja words (or Refresh words) call Claude. Everything else, the daily round, the morning run and the weather included, costs nothing (chapter 13).

## 2. Words used in this guide

| Word | Meaning |
| --- | --- |
| Site | Backyard or Farm. The two are fixed. |
| Zone | A part of a site, typed on each plant ("row 2", "north terrace"). Settings keeps a list per site to pick from. |
| Plant | One record: a single tree, or a group planted together with its quantity ("×12"). |
| Tag | The plant's name in the app, such as "OL-01". The printed QR label is called a tree tag. |
| Profile | What Claude wrote about a species, shared by every plant of that species. |
| Care rule | One line of a profile's care calendar: a kind of task, its months, the age it applies to and, for a watering, the days between waterings and the litres. |
| Task | A dated reminder made from a care rule, or one that you or a diagnosis set. |
| Kind of task | Water, Prune, Feed, Mulch, Harvest, Scout, Propagate or Protect, each with its colour and icon. Today groups the work due now by kind. |
| Window | A task that stays open over a run of months in a row, such as a pruning or a harvest. It is due on the 1st of the run's first month and open until the last day of its last month, so a rule for April and October makes two windows. |
| Watering | A periodic watering: a task every few days inside its months, with its litres in the title. |
| Establishment, mature | A plant under 24 months since its planting date is in establishment; from 24 months it is mature. A plant with no planting date counts as mature. |
| Zone batch | Tasks of two or more plant records in one zone, shown as one card on Today and one line of the notification: the calendar waterings that fall due together, or one window job (the same kind of task, title and window). A group of 12 is one record, so alone it makes no batch. |
| Morning run | The job that runs on the server every morning, at 06:00 Tunis time or within the hour after. |

## 3. Getting started

### Install the app on the phone

1. Open the app's address in Chrome on the phone (plant-care-phi-fawn.vercel.app).
2. Sign in once (below). This also stores a copy of the app on the phone, so it can open later without a connection.
3. In Chrome's menu, choose **Add to Home screen**. Settings → "Install on the phone" says the same.
4. Open Plant Care from its icon. It opens on Today, upright, in its own window without Chrome's address bar.

### Sign in

The app has one account, the owner's, created in Supabase (chapter 15). The Sign in screen has **Email**, **Password** and **Sign in**. There is no sign-up, no password reset and no language switch: the screen follows the language chosen earlier on the phone, or the phone's own. A wrong email or password reads "Sign-in failed: Invalid login credentials".

The sign-in stays on the phone until you tap **Sign out** in Settings or the server stops accepting it. While the app is open with a connection, it renews itself about once an hour. Using the app does not restart that hour, so it can run out a few minutes after you last used the app online. Opened without a connection once it has run out, the app still opens, on what the phone kept (chapter 12), and the sign-in comes back by itself once the connection returns; only a sign-in the server refuses shows Sign in. If the screen says "Supabase keys are missing…", the app was built without its database settings and nothing can be done on the phone (chapter 15).

The sign-in, the language choice and the photos kept on the phone live in Chrome's storage for the app. In an Incognito tab, or after the app's site data is cleared, none of them last.

### Turn on the morning notifications

1. Open Settings → Reminders and tap **Turn on**.
2. Allow notifications when Chrome asks.
3. The card reads "On".

Each phone turns on for itself, and **Turn off** stops that phone only. Signing out does not stop the notifications. If you close Chrome's question without answering, the card stays Off and asks again next time; if you block it, the card reads Blocked (chapter 10).

### Choose the language

Settings → Language → **English** or **Français**. The app reloads in that language, offline too. Until you choose, the phone decides: French for a phone set to French, English otherwise. The choice belongs to the phone; once made here, the morning notifications and the notes the server writes follow it as well (chapter 10). Some text keeps the language it was written in (chapter 10).

### New versions

After an update, the app finds the new version the next time it starts afresh; switching back to it while it still runs in the background does not by itself look for one. It then shows "A new version is ready." with **Reload** at the top of every screen. It never reloads by itself, so a photo you are capturing is not lost: finish, then tap **Reload**. The version you run is at the bottom of Settings.

### Finding your way

- The tab bar has **Today**, **Plants**, the round camera button in the middle (Capture), **Species** and **Settings**.
- The badge on Today counts the tasks late or due today at both sites ("99+" above 99). An open window counts on its first day and again once it has ended, not in between. Without a connection it counts the list kept on the phone, less the actions waiting to be sent. Browsers that support icon badges also show it on the app's icon; Chrome on Android does not.
- Full-screen sheets (Diagnose, Ask Claude, Log something done, Position) close with their **×** or with the phone's back gesture. While a sheet is working, with Claude answering or a save running, it stays open.
- Light or dark follows the phone. With the phone's reduce-motion setting on, the animations, the falling leaves and the vibration are off.
- Two notices can appear at the top of every screen: the update notice, and "This account is not listed as the owner…", which means the database does not accept the account you are signed in with (chapter 14).

## 4. Today: the daily round

### What Today shows

Today lists every task still to do that falls due today or in the next six days, plus anything older still undone, open windows included. It groups them by site, Farm first. In each site the work due now (late, due today, a window that is open, opens today or has ended) comes by kind of task, in the calendar's order: Water, Prune, Feed, Mulch, Harvest, Scout, Propagate, Protect. Inside a kind the cards come late first, then due today, then open windows. The coming days follow under "Later this week", by day.

At the top, over a garden scene that follows the hour, are the date, a greeting and a pill with the week's summary ("12 tasks this week, 3 overdue"). The summary counts both sites, whatever you have filtered. "Overdue" counts only late tasks, not open windows.

### Today's round and the streak

The round card shows a ring of what you have done since midnight against what is due today: "2 of 5 done" with "3 to go", or "Nothing due today", or "All caught up". The total is the tasks done today plus those still late or due today, at both sites whatever you have filtered. Open windows and coming days stay out while they wait; one you do today joins both numbers, so "2 of 5 done" becomes "3 of 6 done". A skipped or snoozed task simply leaves the total. Care you log by hand and a logged treatment count as done.

From two days on, a flame badge shows the streak: the days in a row you opened Today on this phone. It belongs to the phone and is lost if the app's data in Chrome is cleared. When a Done closes the last of the tasks late or due today, at both sites whatever you have filtered, leaves fall across the screen. A skip or a snooze of the last one brings none.

### The week strip and the site chips

"This week" has seven day tiles, starting today. Each shows the number of tasks due that day and the icon of its main kind of task. Today's tile counts everything late, due today and in an open window, and an orange dot on it marks late tasks. Tap a day to see only its tasks; tap it again, or **Whole week**, to see them all. A chosen day shows its tasks by kind, without "Later this week": today's tile shows the same kinds as the whole week, and a coming day its own, so tomorrow's work can be handed out the evening before.

The chips **All**, **Farm** and **Backyard** filter the list and the strip by site. The phone remembers the site. The chosen day clears when you leave Today or the date turns.

### The kinds of work

Each kind with work due now at a site has a heading: its tile and name, its number of tasks and, when one of them is late, "Overdue". The number counts tasks as the site heading does, so the kinds and "Later this week" add up to the site's "N tasks"; a batch card inside counts plants. "Overdue" marks a missed watering, a reminder or follow-up past its day, or an ended window, never a window that is merely open.

- **The order is fixed**, the calendar's, so each kind is in the same place every morning, whoever does it. Urgency shows through the "Overdue" flag, the order inside each kind, the summary's overdue count and the strip's orange dot. A late task of a later kind can sit below the earlier kinds, such as a diagnosis's follow-up, which is a Scout task.
- **Tap a heading to fold the kind**: its cards hide, and the heading keeps its number and flag. Tap it again to open it. A fold lasts the day while the app is open, through Refresh and a visit to a plant. The whole week (with today's tile) and each coming day chosen in the strip fold apart. The next day every kind is open again, and so it is when the app is started afresh.
- **New work opens a fold.** A folded kind opens by itself when a task appears in it that was not there when you folded it: a reminder set for today, a plant saved, an Undo. It then stays open until you fold it again, even once that task is done.
- **Folding is not doing.** The round and the falling leaves still wait for the tasks due under a folded heading, and **Done: all N waterings** is hidden while Water is folded.
- **A kind leaves with its last card.** When its last task is done, skipped or snoozed, the heading folds away with the card, and an Undo brings both back.
- **No Done for a whole kind.** Each card keeps its own buttons. One Done on Water would close today's rounds, a watering window for the whole season and Thursday's waterings two days early, and one note would give the olives and the pomegranates one shared yield.

### Reading a task card

Each card shows the kind of task in its colour, the title, the plant's tag and zone, the due line and the instruction. Tap the top of the card to open the plant.

| Due line | Meaning |
| --- | --- |
| "Overdue · 21 Oct" | A watering, a reminder or a follow-up whose day has passed. |
| "Today" | Due today. A window that opens today reads "Today · until 31 Dec". |
| "Open since 1 Oct · until 31 Dec" | A window that is open. It is not late and does not count in the round. |
| "Window ended 30 Sep" | A window past its last day. The next task refresh (the morning run, Today's first opening, Refresh) closes it as skipped with the note "Window ended". |
| "Thu 5 Nov" | Due on a coming day. You can still do it early. |

A watering's litres are for each plant. A group's own card shows its tag without its count, so "Deep watering (8 L)" on POM-H, a record of 12, means 8 L for each of the 12, 96 L in all; its line in the morning notification reads the same. Only a zone's round of waterings adds the litres up ("216 L in all").

### Done, Skip, Snooze and Undo

- **Done** marks the task done at once: the card ticks, the phone buzzes and the card folds away. A toast, "Done: …", offers **Undo** for five seconds. Only the last action has one: the next Done, Skip or Snooze replaces the toast, and leaving Today removes it.
- **Done with a note**, the link under the buttons, adds a note of up to 200 characters, such as a harvest weight ("12 kg"). The plant's journal shows the note in place of the title.
- **Skip** opens a reason field (optional, up to 200 characters) and **Skip it**. The journal shows the reason. A skipped task leaves the round's total without counting as done.
- **Snooze** offers **1 day**, **3 days** or **7 days**. The days count from the task's own day when it is still to come, and from today otherwise (a late task, a task due today, an open window), so "1 day" on a late task means tomorrow. The toast says "Moved to …"; a snooze has no Undo.
  - If a copy of the task already waits on the new day, it stands in. A day already taken by a done, skipped or snoozed copy is stepped past, up to a week; after that the snooze fails with "No free day to move it to".
  - A window snoozed past its end is stretched to the new day.
  - Snoozing a periodic watering also closes the waterings of the same schedule that fall between the starting day and the new day, with the note "Covered by the snooze to …". Today's watering is not among them, so snoozing a late watering leaves today's to do.
  - A 7-day snooze of a task due today moves it just past the week Today shows, so it is off the list for a day.
- **Undo** reopens what the toast names and clears its note or reason. It reopens only tasks still in the state the action left them in.
- **After the toast.** Undo lasts the five seconds of its toast, on Today only. After that a task closed by mistake cannot be reopened, and no task can be reworded or moved to a day of your choice: Snooze moves it by 1, 3 or 7 days. For care still to do, set a one-off reminder on the plant with **Log something done** → **Remind me** (chapter 6).
- **A window is one task per season.** Done or Skip on a window closes it for that run of months: its rule writes no new task for them until they come round next year. Until you act, it stays on Today and in every morning's notification to its last day, then closes itself as "Window ended". Mark it when the season's work is over. For work done in rounds, such as several pickings, log the earlier rounds with **Log something done** and close the window on the last with **Done with a note**, such as the season's total. On a batch of windows, the note goes on every plant ticked, with the batch's zone and size in front (below).

If a task was already closed elsewhere, by the 06:00 rain skip or on another screen, a Done or Skip changes nothing and a note says the list is up to date. A Snooze on such a task shows "The task could not be updated: This task was already acted on" instead; tap **Retry** to read the list again.

### A zone's tasks in one card

When two or more plant records of one zone at one site have the same job to do, they share one card, a batch, placed in its kind where the most pressing of them would be. A group planted together is one record, so a group of 12 alone makes no batch. There are two kinds of batch:

- **A round of waterings.** The periodic waterings from the care calendar that fall due together: the late ones and today's form one batch, and each coming day gets its own.
- **A window job.** Windows of the same kind of task with the same title over the same window, such as ten olives' "Harvest the olives" from 1 Oct to 31 Dec. Different titles stay apart even in the same months, so a young tree's "Formative pruning" and the mature trees' "Winter pruning" are two cards, and so are two species' scouting. A watering window is a window job too, never part of a round. A window that is open, opens today or has ended belongs to today; one that opens on a coming day belongs to that day.

Zones match whatever their capitals and outer spaces ("Row 2 " and "row 2"), and so do titles; plants with no zone batch together without a label. A reminder you wrote and a diagnosis's follow-up stay as cards of their own. A window you snooze leaves its batch, since its copy has a day of its own (two snoozed to the same day batch together again), and a snoozed watering joins the round of its new day.

- **What a round's card shows.** The title counts plants ("15 plants"): a group counts by its size, and a plant with two waterings due counts once. Next come the zone and "216 L in all", given only when every watering states its litres. The due line reads "Today", "Overdue · …" or "Today · 3 overdue", counted in plants. Then one row per amount with its plants: "40 L · OL-01 OL-03", "8 L · POM-H ×12", "No amount · FIG-03".
- **What a window job's card shows.** It reads like the single card, for several plants: the kind of task, the title, the zone and "10 plants", the window's due line ("Open since 1 Oct · until 31 Dec"), the instruction when every plant has the same one, and the plants' tags. A watering window's title keeps its litres for each plant, and its card adds no total.
- **Done** closes the task of each ticked plant in one save. It is the green button only when the batch holds something late or due today; while a window is merely open, and on a coming day, it is a plain button, since Done closes the window for the season. The toast names the job for a window job ("Done: Harvest the olives · row 2 · 10 plants") and the zone for a round ("Done: row 2 · 14 plants"). The round card at the top counts the tasks closed, so a plant with yesterday's and today's waterings counts two there, and its journal gets a line for each.
- **Done with a note**, on a window job only, writes your note on each plant ticked, with the zone and the number of plants in front: "row 3 · 10 plants: 180 kg", so each tree's journal reads it as the batch's total. Undo removes it. A yield for one tree goes on that tree's own card (the chevron, below).
- **Skip** writes one optional reason on all of them (**Skip them**).
- **Choose** lists the plants; tap a row to untick a plant you leave out. Done then reads "Done 14/15". **Untick all** at the top of the list unticks every plant, for work done over several visits: untick all, tick the trees done today, then "Done 2/10"; once all are unticked it reads **Tick all**. The ticks are kept on the phone for the day while the app is open, through Refresh and a visit to a plant. After the batch's own Done or Skip, the plants left out come back ticked, as a smaller batch or as single cards, and an Undo unticks them again.
- **The chevron** beside a plant in Choose opens its page on the Calendar tab, where its own card offers Snooze and a note of its own. A batch has no Snooze.
- **A coming day's batch** is titled with its day ("Thu 5 Nov · 9 plants", "Thu 5 Nov · Winter prune"), and its Done is a plain button, so the thumb goes to today's.

### Done: all N waterings

At the top of a site's Water section, **Done: all N waterings** closes every watering at that site that is late or due today, in one go and with one Undo. It takes the calendar waterings, a watering window that opens today or has ended, and a watering reminder you set. It leaves out the plants unticked in a batch and needs two waterings or more. It writes no note, so a reminder keeps its words. It is hidden when one batch already holds every one of them, when a coming day is chosen in the strip, and while Water is folded.

### Handing out a kind of work

The share button beside a kind's heading sends that kind's list as plain text through the phone's share sheet: pick WhatsApp, SMS or e-mail, then the person. You can change the text before it goes. A list reads:

```
Water · Farm · Tue 3 Nov

row 2 · 15 plants · 216 L in all
Today · 3 overdue
40 L: OL-01, OL-03, OL-04
8 L: POM-H ×12

row 3 · 3 plants · 60 L in all
Today
20 L: FIG-01, FIG-02, FIG-03
Water at the drip line, never against the trunk.

Water the new carob · CAR-01 · row 5
Today
```

- **What goes in.** Every card the kind shows, in Today's order, each with its due line and the instruction its plants share:
  - a round of waterings: its zone, plants and litres in all, then each amount with its plants;
  - a window job: its title, zone and number of plants, its window, then every tag;
  - a card of its own: its title, tag and zone.

  Every plant is listed, whatever is unticked in Choose, a group with its size ("POM-H ×12"). There are no links and nothing private.
- **The words.** The frame (the due lines, "plants", "L in all") follows the app's language. Titles and instructions go as the profile wrote them, in English, and zones and tags as you typed them.
- **A copy of the moment.** Nothing comes back from it. When the person reports, mark the work on Today: Done, Choose → **Untick all** → tick → "Done 2/10", or **Done with a note** for a weight. Fold the kind once it is handed out.
- **Water after the morning notification.** The morning run may skip waterings after rain, and Today reads the run's result when its notification arrives (below), so hand out Water after it.
- **A coming day.** Choose the day in the strip, then share its kind: the list is headed with that day. "Later this week" has no share button.
- **Two people on one kind.** Share it to each and name the zones, or delete blocks before sending.
- **No share sheet**, as in a computer's browser: the list is copied instead. The share button shows a tick for a moment, and a note at the top of Today says "List copied: paste it into a message." If the list can be neither shared nor copied, the button shows a warning sign and the note says so.

### The weather card

Under the round card, the Weather card shows:

- today's highest and lowest temperature, the rain with its chance, the wind and the gusts;
- the next three days;
- "Rain in the last two days: … mm", the model's figure that the rain skip weighs;
- one banner per alert for today and the next two days, with what to do (chapter 11);
- the spraying block, only when something calls for a spray (below);
- the waterings the 06:00 rain skip closed today;
- "Forecast of …" and the credit "Weather data: Open-Meteo".

The card fetches a new forecast itself when today's is missing or more than six hours old, at most every half hour ("Updating the forecast…"). A failed fetch leaves the stored figures on screen. The card stays hidden until the weather table exists (chapter 15); before the first forecast is stored it shows only its heading while it fetches.

**Spraying (savon noir, oils).** The block appears when a scout, protect, prune or feed task due by tomorrow asks for a spray in its title or instruction (late tasks and open windows included), or when a plant's latest diagnosis of the last 14 days does. It names up to three plants ("For FIG-01, OL-01, OL-03 +1") and lists the calm, cool, dry hours of today and tomorrow, for example "today: 06:00–10:00 (passed), 16:00–19:00". Today's windows read "(passed)" or "(now)" by the phone's clock, and "no calm, cool, dry window" means there is no window that day. Chapter 11 gives the rule behind the windows. A task's words are read by a rule that can misread an unusual sentence, which is why the block names the plants it counted.

### Refresh, and how Today keeps itself up to date

**Refresh**, the circular arrows at the top right, runs the task calendar for every plant now, as the morning run does, but without the rain skip and without notifications. The note says what changed, such as "3 tasks added, 1 removed, 1 ended window closed, 2 old waterings closed", or "Tasks are up to date". Chapter 11 explains each part. The app waits 30 seconds for it; after that Refresh reports a failure, although the server may still finish.

Today also keeps itself current:

- it runs the same task calendar once per app session, the first time it opens;
- it follows the clock on the hour: the greeting, the scene and the spraying marks;
- it reads everything again at midnight; and from 06:05 it looks at the morning run's record (chapter 11) every five minutes while it is visible, and each time you come back to it, until it has seen the day's run or 07:15 has passed, and reads everything again when the run came after its list;
- it reads its list, the weather and the badge again as soon as a notification arrives while the app is open or in the background. The morning run can come as late as 06:59, so a list read between 06:05 and the run is brought up to date by the run's own notification or by the next look at its record, without **Refresh**. An app that was closed reads everything when it opens;
- the badge is counted again whenever you move between screens or come back to the app.

When nothing is due this week at either site, Today shows "Nothing due this week." with **Photograph a plant**. When only the site you filtered, or the day you chose, has nothing, the list reads "Nothing due on this day."; tap **All** or **Whole week** to see the rest.

### Today without a connection

Today keeps the last list it read on the phone. Opened without signal, it shows that list at once under today's date, with the banner "Offline · Shown as of 19:12, not updated" (with the day when the list is from another day) and **Retry**; the round starts at 0 done unless the list was read today; the weather card shows its last rows; the Today badge counts the kept list. Tap **Retry**, or come back with signal, and the fresh list takes its place.

**Done** and **Skip** work without a connection, on one card, on a batch and with Done-all. The card leaves as usual, the round counts the Done, and the toast reads "Done: Water OL-01 · saved on the phone" with **Undo**, which brings the card back as long as the action has not been sent. The banner then counts "2 actions waiting", with **Send now**. The actions go out when the connection returns, when the app comes back to the foreground, when Today opens or on Send now, one at a time, each written with the time of your tap, so the journal shows when the work was done. A write that hangs for more than 8 seconds on a weak signal is kept the same way, so nothing spins for minutes; a tap whose write landed but whose reply was lost is recognised by its time when it is sent, and counted as done rather than "closed meanwhile". **Snooze** needs a connection and says so, after the same 8 seconds when its writes hang.

When a saved action reaches the server, a task the morning run had closed meanwhile (the rain skip, an ended window) is closed as you asked, since your tap came first; a task you had closed from another screen is left as it is, and the banner says "1 saved action was not applied: the task had been closed meanwhile." If the sending fails while the phone is online, the banner says why and keeps for the next try what did not go through; a batch written in part keeps only the tasks still to write, the ones written leave the list (a Done counts in the round), and Undo on its toast reopens those while the rest comes back as tasks to do. After a sent action, Undo on its toast reopens the task as the online Undo does.

The saved actions belong to the phone: a Sign out keeps them, and they go out after the next sign-in. A Done made offline on a plant's Calendar tab is not kept; only Today's are.

## 5. Adding a plant with Capture

Capture needs a connection, since the photo goes to Claude on the server. It always adds a new record: for a tree already in the app, open its page and use **Add a journal photo** or **Diagnose** instead. Capturing it again gives it a second record with its own tasks, counted twice on Today and in the notifications; if that happens, delete the newer one.

### Photograph and identify

1. Tap the camera button in the middle of the tab bar.
2. Under "Where is this plant?", tap **Backyard** or **Farm**. The phone remembers the choice; it is Farm the first time.
3. Tap **Take a photo**, or **Choose from gallery** for a photo already on the phone. A gallery photo keeps its own date and position.
4. "Preparing the photo…": the phone reads the position and date stored in the photo, turns it upright, and shrinks it to 1,280 px with a 320 px copy for lists. The full-size original is never uploaded.
5. "Identifying…": the photo goes to Claude with the site. **Start over** cancels, but the call already started is paid.

### Reading the candidates

Claude gives up to three candidates, best first, the best one outlined. Each card shows the English name, the scientific name, the French and Arabic names, a confidence bar and the evidence Claude relied on. A cultivar is named only when something in the photo supports it. "Grows as" gives the top candidate's plant type, lifecycle, foliage and food-forest layer. The confidences need not add up to 100 %. The usage line, "Usage: … in / … out tokens", shows what the call used. Claude writes the evidence and advice in English, whatever the app's language.

Tap **Confirm** on the right candidate.

- **Low confidence.** When the best candidate is under 60 %, a banner says which second photo would settle it: a leaf close-up, bark, fruit, a flower or the whole plant. **Add a second photo** opens the camera. Both photos go to Claude as the same plant, and the new answer replaces the first, whatever it is: new candidates ("Two photos sent"), "No plant recognised" or a refusal. There is no third photo.
- **"No plant recognised".** The photo shows no plant, or is too blurry or dark, and Claude says what photo would help. Tap **Start over**, or type the name.
- **"Claude declined this request".** Claude declined, and so did Anthropic's fallback model where one exists for that kind of request. Only **Start over** is offered.
- **Retry** sends the same photo again after the first identification failed, with the site now chosen. Each Retry is a new identification. When the call with a second photo fails, there is no Retry: the first answer stays with the error above it, the second photo is dropped, and **Add a second photo** takes it again.

### Typing a name instead

Under the candidates, or under "No plant recognised", type a common or scientific name and tap **Use this name**. A name equal to a stored profile's scientific, English, French or Arabic name, or its Arabic name in Latin letters, capitals and extra spaces aside, costs nothing. Any other wording costs a profile call, even when the species turns out to be in the library already.

Capture then shows only the name you typed, not the species it was matched to. You see the species on the page that opens after **Save plant**, and the plant cannot be moved to another species afterwards, so a scientific name leaves the least room for a wrong match.

### The species profile

Confirming starts the profile at once, so Claude can write while you fill in the form.

- "Writing the species profile with Claude…": the app is asking for the profile. A profile found in the library comes in seconds; one Claude writes takes a minute or more. **Save plant** stays greyed until the profile is in, and while it has failed.
- "Species profile already in the library": the profile was in the library before you confirmed, and nothing is paid ("Usage: 0 in / 0 out tokens" under this line). A new cultivar of a profiled species shares its profile. Two paid cases show the same line: a typed name that was not exactly one of the stored names, whose usage line shows the tokens, and a profile found again after a lost reply (below), which shows 0 tokens.
- "Species profile written": Claude wrote a new profile, stored as written by Claude and not confirmed.
- "The connection dropped while Claude was writing. Checking whether the profile has arrived…": the reply did not reach the phone. Usually the server carries on and stores the profile, and the app looks for it every 10 seconds for up to 5 minutes, without paying again. Keep Capture open. The same line shows when the phone had no signal at the moment you confirmed: then a profile already in the library arrives once the signal is back, but for a new species "The profile could not be written: No answer was found…" comes only after the 5 minutes. For a typed name, the search finds the profile only when one of its names is exactly what you typed; otherwise the profile is in the library, but **Retry the profile** pays for another call before it finds it.
- "The profile could not be written: …" with **Retry the profile**. If an earlier attempt stored the profile meanwhile, the retry finds it, at no cost for a confirmed candidate.

**Pick another** goes back to the candidates without a new identification; what you typed in the form is lost. A profile already started for the first choice is not stopped: for a new species Claude still writes it and it is paid, then it is deleted when the capture ends unless a plant uses it.

### The plant record

| Field | What to put |
| --- | --- |
| Tag | The plant's name in lists, in notifications and on its tree tag. Required; it starts as the confirmed name. The app does not check that tags differ, and Today, the batches and the notifications name each plant by its tag, so give each record its own, short one, such as "OL-01" and "OL-02": a printed tree tag shows about 16 letters (chapter 7). |
| Quantity | How many plants the record stands for, for a group planted together. A whole number from 1. |
| Planted on | Optional. Empty means the age is unknown, and the plant gets the mature care rules. A date less than 24 months ago gives it the establishment rules. |
| Site | Backyard or Farm. It starts on the site chosen above. Changing it keeps the zone you typed. |
| Zone | Optional. The site's zones from Settings show as chips, and the field also suggests the zones other plants of the site use. |
| Source | Nursery, Seed, Cutting, Graft or Existing, which is the default. |
| Rootstock | Optional, for a grafted tree. |
| GPS | Filled from the first photo when it carried a position ("GPS read from the photo"). **Set position** opens a map to place the plant (chapter 7), and **Clear** removes the position. |

### Save plant

**Save plant** stores the plant, uploads each photo with its small copy, writes the plant's tasks for the next 90 days and opens its page. With two photos, both are kept, and the newer one heads the plant's page and the Plants list. If the tasks cannot be written at that moment, the plant is saved anyway and its tasks come with Today's **Refresh** or the morning run. When the profile is not confirmed yet, which is always so for a profile just written, the species page opens first with "AI-written profile. Read it through, then confirm." and **Done**, which leads to the plant.

If a step fails, with "The photo upload failed: …" or a network error, tap **Save plant** again. It writes into the same plant and photo, and never makes a second plant. After a lost reply, **Pick another**, **Start over** and **Not planted yet? Check it instead** can show again although the plant may be stored; Save plant is the safe way on.

Once Save plant has started, leaving Capture for another tab does not stop it, but closing or reloading the app does. A step that fails after you left shows no message: the plant may not be stored, or be stored without its photo, its tasks then coming with Today's **Refresh** or the morning run. On a weak signal, stay on Capture until the plant's page opens.

### Other ways out

- **Not planted yet? Check it instead** appears once the profile is in, until the plant is saved. It leaves without saving a plant or the photo and opens Check before planting for this species (chapter 9). The profile stays in the library, as "Not planted yet" while no plant uses it.
- **Start over**, or leaving Capture for another tab, drops the photo and the answer. A profile Claude wrote for this capture that no plant uses is deleted, so the next capture of that species writes, and pays for, a new one. Some stay in the library unused: a profile whose answer arrived after you left, one found again after a lost reply, one left while the phone had no connection, and one written when the app was closed or reloaded mid-capture. Their pages offer **Delete this profile**.

## 6. A plant's page

Open a plant from the Plants list, a pin on the map, a task on Today or a scanned tree tag.

### The header and the buttons

The header shows the newest photo, the tag, the number of plants, the site and zone, **Show on map** when the plant has a position, the names in three languages, the scientific name, the layer and the plant type. Under them is the age line, with the date in the phone's short format: "Planted 01/06/2026 · 5 months old (establishment)", "… 3 years old (mature)" or "Planting date unknown (treated as mature)".

- **Edit record** corrects the tag, quantity, planting date, site, zone, source, rootstock or position.
- **Add a journal photo** opens the camera straight away and adds the photo to the journal; it becomes the header photo when it is the newest. A photo taken earlier, for example at the farm without signal, cannot be added this way, while Capture and Diagnose take one from the gallery. A journal photo carries no words; to note something beside it, use **Log something done**.
- **Open the species profile** opens the profile shared by every plant of the species (chapter 8).
- **Diagnose** photographs a problem (below).
- **Position** places the plant on the map (chapter 7). It is greyed while Edit record is open; use the form's Set position then.
- **Tag** prints this plant's tree tag (chapter 7).
- **Log something done** records care done by hand, or sets a one-off reminder.
- **Ask Claude about this plant** starts a conversation about this plant.
- **Delete this plant** is at the bottom of the page.

The back arrow on the photo always opens the Plants list. The phone's back gesture goes back the usual way.

### The tabs

- **Needs**: fit for this site; water (need, drought tolerance, summary, stress and overwatering signs); sun and heat; salinity; climate (frost and chill). These come from the profile and are edited on the species page.
- **Calendar**: "Next tasks", the plant's twelve earliest pending tasks with Done, Skip, Snooze and Done with a note, then the profile's care rules by month. A rule for the other age is greyed with "Does not apply at this plant's age". Actions here have no Undo.
- **Health**: the species' pests and diseases with their symptoms, organic treatment and prevention, then the "Past diagnoses" of this plant. Tap one to reopen it.
- **Guild**: good and bad companions, root warnings, the uses (edible parts, preparation, storage, ripeness cues) and the toxicity for humans, chickens, goats, and dogs and cats. None and Mild share one colour, so read the word.
- **Journal**: everything that happened to the plant, newest first. It holds the photos (identification, journal, problem), the tasks done, skipped or snoozed, each shown by its note or reason in place of its title when it has one, the treatments ("Treated: …"), and the questions to Claude with **Open the conversation**. A task is dated by when it was acted on. The notes of the task refresh and the rain skip (chapter 11) appear here too: "Window ended", "Superseded by the next watering", "Missed watering", and "Rain: 14 mm in the last two days" or "Rain forecast today: 12 mm". Journal photos show as small copies; a problem photo opens larger with its diagnosis (**Open**), and the newest photo heads the page.

### Editing the record

**Edit record** opens the form under the buttons. **Save** stores it, then rebuilds this plant's tasks; if that second step fails on a weak signal, nothing says so, and the tasks follow at the next task refresh (Today's first opening, **Refresh**, or the morning run). A new planting date can move the plant between establishment and mature: the pending tasks of the old stage's rules go, and the new stage's rules get tasks for the next 90 days. Tasks already acted on stay in the journal.

When some plants of a group die, lower its **Quantity** rather than deleting the record: the batch counts, the litres in all and the "×12" on the list and the map follow, and the tasks stay as they are. There is no species field: a plant recorded under the wrong species is deleted and captured again.

### Log something done

1. Tap **Log something done**.
2. Pick the **Kind of task**: Water, Prune, Feed, Mulch, Harvest, Scout, Propagate or Protect.
3. Leave **Done today**, or tap **Remind me** and pick the day: tomorrow by default, today or later.
4. Type **What was done**, or **What to do** for a reminder, up to 80 characters, and an optional note.
5. Tap **Save to the journal**, or **Set the reminder**.

A "Done today" entry goes to the journal and counts in Today's round, and Ask Claude and Diagnose read it. With a note, the journal shows the note in place of what was done: "Mulched with straw" with the note "two buckets" reads "two buckets" beside its Mulch label, so leave the note empty or write it to read on its own. An entry does not close a scheduled task of the same kind: mark that task Done itself.

The app has no way to delete a journal entry, and the Journal tab does not reload by itself. If a save seems to fail on a weak signal, close the sheet, go back to Plants and open the plant again, then look at its journal before saving again.

A reminder shows on the Calendar tab once it is among the plant's twelve earliest tasks, on Today in its week, and in the morning notification once due. The morning run never removes it, with one exception: the 06:00 rain skip closes a Water reminder due that day, or still open from an earlier day, like any watering. A reminder's note shows on no card, and a Done, Skip or Snooze from its card replaces or drops it, so put what matters in "What to do".

### Diagnose a problem

1. Tap **Diagnose**.
2. Tap **Take a photo** or **Choose from gallery**: the affected leaf, shoot, fruit or trunk, close and in focus. **Another photo** opens the camera and replaces the photo; to choose another one from the gallery, close the sheet and tap **Diagnose** again. One photo is sent.
3. Optionally fill **What you see**, up to 500 characters, such as "yellow edges on the lower leaves since last week".
4. Tap **Send to Claude**. "Diagnosing…" shows, and the sheet stays open until the answer comes. If the connection drops meanwhile, the sheet says "The connection dropped while Claude was diagnosing. Checking whether the diagnosis has arrived…" and looks for it for up to five minutes: the server saves the diagnosis as soon as Claude has answered, so it is found rather than paid for again. You can close the sheet while it looks; the looking goes on, and the diagnosis then shows on the Health tab with its reminder set.

Claude reads the photo with this plant's context: the profile's needs and its pests, the plant's age, site and zone, the weather of the last week and the next three days, and its recent tasks. The answer is in English, whatever the app's language. The result shows:

- a summary with its urgency: "Act today" when the plant may be lost or the pest spreads fast, "This week" for most pest and disease cases, "Watch" for cosmetic or weather damage;
- up to three likely causes, each with a bar (orange under 60 %), its kind and the evidence;
- the checks to do on site, the organic treatment and the prevention;
- the follow-up, such as "Re-photograph in 14 days (14 Nov)" and "Reminder set for 14 Nov", or "No follow-up photo needed.";
- the usage line.

The photo and the diagnosis are saved in the journal as a problem photo: the photo is uploaded while Claude works, the server writes the diagnosis as soon as Claude has answered, and the app then adds the follow-up. A gallery photo keeps the day it was taken, and the diagnosis is dated and sorted by that day. The follow-up becomes a scout task, "Re-photograph OL-01: …", or "Scout OL-01 for …" when a pest leads at 50 % or more, counted from today. It shows on Today when due and in the morning notification, and the morning run never removes it. If the save fails, tap **Save again**: it writes nothing twice and does not call Claude again. A declined or failed call leaves no photo behind. When the treatment calls for a spray, the plant appears on Today's spraying line for up to 14 days from the photo's day, until a newer diagnosis says otherwise.

**Mark treated** opens a field: type what you applied ("savon noir 2%, evening spray") and tap **Log it**. It is logged as a protect task done today, shown in the journal as "Treated: …"; left empty, the field logs the leading cause. One treatment per diagnosis per day ("Already logged today.").

**Derja words.** A diagnosis made since version 0.16.0 shows, after each key term, the word people say for it in Tunisian, in Arabic letters and in parentheses: the name of the pest or disease, the product, the action. The English stays as it is; the word is there for you to say aloud to the worker who will treat the tree or to the supplier. A term is marked once in each text, at its first mention. Where the term is already followed by parentheses, the word goes inside them, before a " · ".

Below the treatment, the **Derja words** card lists the terms with their words. Tap a line to change it:

- type your word in Arabic letters and tap **Save**: the line says "your word", the text changes at once, every diagnosis made since 0.16.0 that mentions the term shows your word, and Claude is given your words for the next diagnoses. A word in Latin letters is refused ("Write the word in Arabic letters");
- "add your word" marks a term Claude knew no local word for: it gives none rather than guess. Type yours the same way;
- save the field empty to show no word for the term ("no word"). The line stays wherever Claude has a word for the term or the page's own list has it, so you can put one back;
- **Use Claude's word** drops your correction, and Claude's word shows again.

**Which word shows.** For any term the app takes, in this order: your own word; else the first word Claude ever gave for that term, anywhere in the app; else the word Claude gave on this page. So a term carries one word on every diagnosis and every species, and a diagnosis you already had may change a word to the one Claude gave first elsewhere, until you correct it. A word you typed is never taken for Claude's.

### Derja words on the profile

The Needs, Calendar, Health and Guild tabs of a plant's page, and the species page in the library, show the same words: beside the pests and diseases, the products, the operations (pruning, mulching), the tools and the companion plants named in the text. Ratings and pills carry none, and neither do the task cards on the Calendar tab, the Past diagnoses list, Today, the notifications or the shared lists.

- **Words that are already known show at once**, on any species, at no cost: your own, and those Claude gave on a diagnosis or on another species.
- **Get derja words**, at the bottom of each tab's "Derja words" card (one card for the whole profile on the species page), asks Claude for this species' own list: up to 40 terms. It costs one call ("Asking Claude…", some seconds). The profile itself is not rewritten and stays confirmed.
- Each tab's card lists the terms that stand on that tab, with the same editing as on a diagnosis: tap a line to type your word, clear it, or go back to Claude's.
- **Refresh words**, with the date of the last fetch, runs the call again. Nothing runs by itself: after you edit or regenerate a profile the words stay, and a term that left the text simply stops showing.
- While Claude is asked, the species page holds Regenerate, Delete and its editors; while an editor is open or a regeneration runs, the button waits.
- "No derja words for this species yet." means nothing is known for this page and the list was never fetched; "No key term on this page." means the fetched list has nothing for it.
- "The derja words could not be read. They will show when the connection is back." replaces the button when the words could not be read, so that a list already paid for is never asked twice; the card reads again by itself when the signal returns.

Claude's knowledge of Cap Bon farm words is uneven: expect some standard Arabic where your workers say something else, and correct it. "Aphid" and "aphids" count as one term, and so do "mangos" and "mangoes"; two spellings ("mould", "mold") do not. Typing a word needs an Arabic keyboard on the phone (chapter 15) and a connection. The words show on an opened diagnosis, a plant's profile tabs and the species page only: task titles and instructions, notifications, shared lists and the journal's lines carry no Arabic, and a diagnosis made before 0.16.0 stays as it was.

Reopen a diagnosis with **Open** on its journal entry, or from Past diagnoses on the Health tab. On a reopened diagnosis the "Re-photograph in … days" date counts from today; the reminder's real day is the "Reminder set for" line. **Set the reminder** appears when no follow-up exists. It also appears when the follow-up could not be read, for example on a weak signal: in that case reopen the diagnosis before tapping it, or you get a second reminder. The sheet takes one diagnosis per opening: close it and tap Diagnose again for the next.

### Ask Claude about this plant

1. Tap **Ask Claude about this plant**.
2. Tap a starter question to fill the box ("What should I do for it this month?", "How should I water it now?", "What would grow well beside it?"), or type your own, up to 1,000 characters. A chip replaces what is in the box, and nothing is sent until **Ask**.
3. Tap **Ask**. "Claude is thinking…" shows. If the connection drops meanwhile, the panel says "The connection dropped while Claude was answering. Checking whether the answer has arrived…" and looks for it for up to five minutes: the server saves the answer as soon as Claude has answered, so it is found rather than paid for again. You can close the panel while it looks; the looking goes on, and the answer then shows in the journal. When nothing is found in time, "No answer was found. The call may have been declined or lost; asking again is a new call."
4. Read the answer. When it departs from the profile, an amber "Check the profile" note names the field, with **Open the species profile**. Nothing changes the profile by itself.
5. Tap a suggested next question to carry on, or type another.

Claude reads the profile and its care calendar, whether you confirmed and edited it, the plant record, the other plants of its zone, the last time each kind of task was done, the tasks of the last 30 days and the next 30, the last three diagnoses with their treatments, and the weather. It answers in the language of the question. It says "the app has no record of…" rather than assume care was not given, since you may do things the app never records. Each question carries the last six exchanges of the conversation.

Each answer is saved in the journal as a "Question", by the server as soon as Claude has answered and then by the app, which finds it already there; **Open the conversation** reopens the thread to carry on. A declined question is shown but not kept. For something you can see, Diagnose with a photo gives a better answer.

### Delete this plant

For a plant that died or was recorded under the wrong species. After a confirmation, the plant goes with its photos, all its tasks and its conversations; the species profile and its planting checks stay. It cannot be undone, and the plant's printed tree tag then reads "No plant has this tag".

## 7. Plants, the map and tree tags

### The list

Plants lists every plant record, newest first, with its photo, its tag ("×12" for a group), its species and the site and zone. The chips **All**, **Backyard** and **Farm** filter by site. **Search by tag or name** matches any part of the tag, the zone, the common names or the scientific name. The phone remembers the site chip and the List or Map view, and Plants opens in that view; the search clears when you leave. Tap a card to open the plant.

### The map

**Map** shows each placed plant as a pin coloured by its most pressing task due by today. The key under the map names each colour:

| Pin | Meaning |
| --- | --- |
| Red | Late |
| Green | Due today |
| Yellow | A window is open |
| White | Nothing due, or what is due is not read yet |

In the phone's dark theme the coloured pins are lighter, and Late looks orange. If what is due cannot be read, every pin stays white and the map says "What is due could not be read: the pins show no colours."; tap **Retry**.

A group shows "×12", and from close zoom the tags show beside the pins. Tap a pin for its card, with the photo, tag, species, up to two tasks and **Open**. The site chip and the search apply here too, and **All** frames both sites.

- **Where am I**, the target button at the top right of the map, listens to the GPS for up to 20 seconds, brings the map to you and shows your position with a circle of its accuracy ("You are here, ±6 m").
- "N plants have no position yet" counts the plants left off the map. **Show them** lists them, so you can open one and place it. Coming back from a plant shows every plant again, so tap **Map**, then **Show them**, for the next one.
- The layers button switches between the satellite view and the street map when the app has a satellite key (chapter 15). Without one only the street map shows ("Street map only: …"). If the satellite tiles fail, that map falls back to the street map until it is closed, and says why.
- The app keeps no map tiles for use without a connection.

### Placing a plant

On the plant's page tap **Position**, or **Set position** in the record form. A full-screen map opens with a fixed cross in the middle, and the site's other plants as small dots.

1. Optionally tap **Use my location**. The phone listens to the GPS for up to 20 seconds, stops early at 5 m, and brings the map to you. Under trees a phone is often 5 to 15 m off.
2. Drag the map until the cross sits on the tree, on the satellite view if you have it.
3. Tap **Save here**.

What is saved is the point under the cross, never the raw GPS reading. From the plant's page it is saved at once, which needs a connection; from the record form it fills the form's GPS line, which is saved with the form. On the plant's page, **Remove the position** under the map clears it at once; it shows only when the plant has a position. In the record form, tap **Clear** on the GPS line instead, then save the form. A farm plant's position also moves the point the weather forecast is read for (chapter 11).

When the phone shares only a rough location, the sheet says "Only an approximate position (±… m): set this site's location access to Precise in Chrome." When location is refused it says "Location is blocked for this app: allow it in Chrome's site settings, or place the tree on the map." You can always place the tree by hand.

### Printing tree tags

- **Print tags**, the printer button on Plants, makes a sheet for the plants the site chip and the search keep, or for the plants without a position when that list is shown.
- **Tag** on a plant's page makes a sheet with that plant's tag alone. A group planted together gets one tag for the whole record, and the tag does not show its "×12".

Each tag is 40 × 50 mm, with a QR code, the tag in large letters, the species, the site and zone, and an 8-character code ("0D6F 2C1E"). The tag, the species and the site and zone each take one line, and a line too long is cut short with "…". About 16 letters and spaces of the tag fit, fewer in capitals, so "Olive row 2, tree 3" prints as "Olive row 2, tre…": put what tells the trees apart first, or keep tags short, such as "OL-01".

On the phone's screen the tags look smaller than they print. Tap a tag to leave it out. Tap **Print** and choose Save as PDF or a printer, A4, at actual size: 20 tags fit a page. The black bar at the top must measure 50 mm on paper; if it does not, print again at actual size. Cut along the dashed lines and laminate the tags for the outdoors.

A tag stays valid when the plant is renamed or moved, and ends when the plant is deleted. Print from the app at its usual address, since the QR code holds the address the sheet was opened from.

### Scanning a tag

Point the phone's camera or Google Lens at the QR code and open the link. The plant's page opens, after Sign in if that browser is not signed in. "No plant has this tag. The plant may have been deleted." and "This is not a plant tag." say why not.

To type a code by hand, open Chrome, since the installed app has no address bar, and type the app's address followed by /t/ and the 8 characters without the space, such as plant-care-phi-fawn.vercel.app/t/0D6F2C1E. Capitals or small letters both work.

## 8. The species library

### The library

The Species tab lists one card per profile, sorted by scientific name, with **Check before planting** at the top. The chips **All**, **Planted** and **Not planted yet** split the library. "Not planted yet" means no plant record uses the profile: a species checked before planting, one whose plants were deleted, or one left by a capture that did not finish. Each card shows how many plant records use it, the verdict of its newest planting check ("Plant it", "Plant with care", "Avoid") and "Confirmed" or "Not confirmed".

### Reading and confirming a profile

A profile shows, in order: the names and growth form, "Written by … on …", the "Before planting" card (chapter 9), Identity, Needs (fit for this site, water, sun and heat, salinity, climate), the Care calendar, Pests and diseases, Guild (companions, uses, toxicity), and the Derja words card for the whole profile, whose words also stand beside the key terms in the text (chapter 6).

A profile Claude wrote shows "AI-written profile. Read it through, then confirm." Read it, correct what is wrong, then tap **Confirm profile**. Confirming changes no task: the plants' tasks are written from the calendar as it stands, from Save plant on, confirmed or not, so read the Care calendar first, since it is what the reminders follow. Ask Claude and Check before planting are told whether the profile is confirmed and which parts you edited.

### Editing a part

Tap **Edit** on Identity, or a part's button after "Edit" in the Needs or Guild card: Fit for this site, Water, Sun and heat, Salinity, Climate, Companions, Uses or Toxicity. Change the fields and tap **Save**. One editor is open at a time, and editing leaves the confirmation as it is.

Edits are kept per part: in Needs and Guild, one changed field keeps the whole part as yours, marked "edited by you", and a rewrite by Claude then leaves that part alone. Identity is kept item by item, although "edited by you" shows on the whole card: a changed name keeps all four names, and the plant type, lifecycle, foliage and layer are each kept only if you changed them.

A photo finds its profile by the scientific name alone, whatever the capitals; the cultivar only picks between two profiles of one species, so a photo of another cultivar still uses this one. Keep the scientific name as the bare binomial (Genus species, with no author, no × and no cultivar): anything else stops photos of that species from finding the profile, and the next identification writes and pays for a second one.

### Editing the care calendar

The calendar belongs to the species, not to one plant: every plant of the species follows it, at both sites, and a change reaches all of them. No plant can have a schedule of its own. For one plant that needs other care, such as a tree in a pot or on drip, skip the tasks that do not fit it and set its own with **Log something done** → **Remind me**.

Tap **Add a rule** on the Care calendar heading, or **Edit** under a rule.

| Field | Meaning |
| --- | --- |
| Type | Water, Prune, Feed, Mulch, Harvest, Scout, Propagate or Protect. |
| Age | Establishment (the first 24 months), Mature, or Any age. |
| Months | Tap the months. Consecutive months make one window, across the new year too (November to February is one); months with a gap between them make separate windows. |
| Days between waterings | Water only, and required: one watering every that many days inside the months. |
| Litres per watering | Water only, optional. It goes into the task's title, such as "(20 L)", and into the zone totals. |
| Days of warning before the window | How many days before a window opens the morning notification mentions it, once. No effect on waterings, and a warning over 90 days never arrives, since tasks are written 90 days ahead. |
| Title, Instruction | What the tasks say. The title is required. |

The form refuses a second rule with the same type, months and age ("Another rule already has this type, these months and this age. Change one of them."), since the two would share their tasks.

Saving any rule saves the whole calendar as yours, so a rewrite by Claude never changes it again, and there is no button to hand it back. When plants use the profile, their tasks are rebuilt at once ("Refreshing the tasks from the new calendar…", then "Tasks refreshed").

- A new type, months, age or watering interval replaces the rule's pending tasks with a new schedule, written with the new wording.
- A new title, instruction or litres alone reaches only the tasks written from then on. The tasks of the next 90 days are already written and keep their wording, so a new amount of water shows on Today and in the zone totals only after them, up to three months later.
- A new warning applies from the next morning's notification.
- **Delete this rule** removes its pending tasks. Done and skipped tasks stay in the journal.

### Editing pests

Tap **Add a pest**, or **Edit** under a pest: the English name (required), the French name, the months, the symptoms, the organic treatment and the prevention. A pest edit changes no task, since scouting reminders come from the calendar's scout rules. Claude reads each pest's names, months, symptoms and treatment in diagnoses, questions and checks. Like the calendar, a saved pest list stays yours.

### Regenerate from Claude

**Regenerate from Claude**, after a confirmation, has Claude rewrite the profile (about 15 cents). It keeps the parts marked "edited by you", the scientific name and the cultivar, and sets the profile back to not confirmed. A rewritten calendar reaches the tasks at the next task refresh (Today's first opening, Refresh, or the morning run), not at once. If the connection drops during a rewrite, the server may still finish it: reopen the page after a few minutes before regenerating again, since a second rewrite is paid again.

### Delete this profile

Offered only when no plant uses the profile. It deletes the profile with its planting checks, and a later photo or check of that species writes a fresh profile.

## 9. Check before planting

Before you buy or plant something, ask Claude whether it will do well here. Claude weighs its profile against the saline well, the lime soil, the heat and the sirocco, the cold and the chill hours, the chickens, the space, the pests, and the plants already recorded in each zone.

### Three ways in

- Species tab → **Check before planting**, then type the plant's name ("avocado", "Hass avocado", "Persea americana").
- A species page → the "Before planting" card → **Check before planting**, or **Check again**.
- Capture, once a candidate is confirmed and its profile is in ("Species profile written" or "Species profile already in the library") → **Not planted yet? Check it instead**. The check opens with Capture's site chosen; tap **Not decided** to compare both.

### The form

1. Under "Where would it go?", tap **Backyard** or **Farm**, or leave **Not decided** to compare both.
2. With a site chosen, optionally give a zone: tap a chip from your Settings list, or type one.
3. Optionally fill "What is it for?" ("shade over the chicken run"), up to 300 characters.
4. Tap **Check**. "Finding the species (a new one is profiled first)…" shows while the name is matched or a profile written, then "Checking the fit…".

A typed name equal to a stored name costs no profile. Any other name pays for a profile call first. When Claude names a species not yet in the library, its profile is kept as "Not planted yet" ("New profile written"); when it names one already there, the stored profile is used ("Profile call matched to the species in your library").

After a failed or refused check the species stays chosen, and **Check** tries again without a new profile. To check a different name, open the Species tab and tap **Check before planting** there: the back arrow opens the page of the species already chosen.

### Reading the verdict

| Verdict | Meaning |
| --- | --- |
| Plant it | No factor is a problem and the cautions are routine. |
| Plant with care | It can work with the precautions the check names. |
| Avoid | A problem that cannot be managed at reasonable cost. Claude is told not to soften a poor fit. |

Beside the verdict is the best site ("Best at the farm", "Best in the backyard", "Suits either site", "Suits neither site"), given even when you named one. Then come the summary and the eight factors, each Good, Caution or Problem with a note:

| Factor | What it weighs |
| --- | --- |
| Saline water | The well's chloride against the species' tolerance, and the share of rainwater it would need. |
| Water | Its need against a low-flow well and the dry summers. |
| Heat | Summer sun and heat, and the sirocco. |
| Cold and chill | Frost, and for fruit trees the chill hours of Cap Bon's mild winters. |
| Lime soil | Lime-induced chlorosis and drainage. |
| Animals | The free-ranging chickens, dogs and cats: the damage they do, and its toxicity to them. |
| Space | Its mature size and root spread against the neighbours, with the spacing it needs. |
| Pests | Those already on site or common in Cap Bon. |

Then "Where to plant it" (a zone from your inventory or the kind of spot, and the neighbours that help or compete), "When to plant", "At the nursery" (cultivars, rootstocks, container size, the signs of a healthy plant) and "First year" (litres and days between waterings by season, and protection). When the verdict is not "Plant it", "Better choices here" gives up to three alternatives.

**Check this one** under an alternative opens a new check with its name and the same site and note. Nothing runs until you tap Check, and an alternative already in your library costs no profile.

### Saved checks

Every check is saved with its species. The newest shows on the species page's "Before planting" card, where **Open** reads it back at no cost, and as the verdict on the species' library card. **Check again** makes a new check. The older ones stay saved, but the app cannot open them again, so read what you need before you check again. From the species page Check again starts with an empty form; on a check's own screen it keeps that check's site, zone and note. The server saves a check as soon as Claude has answered; if the connection drops while Claude checks, the screen says "The connection dropped while Claude was checking. Looking for the saved check…" and finds it within a few minutes rather than paying again. If "The check is not saved yet." shows, tap **Save again**. A check is written in the app's language at the time.

## 10. Settings

Each card reads its data when Settings opens; to see a change made elsewhere, leave Settings and open it again.

### Reminders

Turns the morning notifications on or off for the phone in your hand.

| State | Meaning |
| --- | --- |
| On | This phone receives the notifications. **Turn off** stops them. |
| Off | Tap **Turn on**, and allow notifications when Chrome asks. |
| Blocked | Notifications are blocked for the app. The installed app has no Chrome menu: open the app's address in Chrome, then ⋮ → Site settings → Notifications → Allow, or allow them in the phone's settings. Then open Settings again and tap Turn on. |
| Not available | This browser cannot receive Web Push, or the app's background worker did not answer within 8 seconds. Use Chrome, and try again a little later. |
| Not configured | The app was built without its push key (chapter 15). |

Each phone or browser is turned on separately and gets every notification, for both sites; turning off removes only that phone. A phone turned on under an older push key reads Off and needs Turn on again. A morning with nothing due at a site, and no alert, sends nothing. If the card reads On but nothing has come by 07:00 on a morning with tasks due, tap **Turn off**, then **Turn on**. If still nothing comes, check the push keys in Vercel (chapter 15): when they do not match the app's, the card reads On and every notification is refused.

### Weather

- **Skip waterings after rain**: **On**, the default, or **Off**.
- **Rain that counts**: **5 mm**, **10 mm** (the default), **15 mm** or **20 mm**. It shows only while the skip is **On**.

Each tap saves at once, and the next morning run uses it; chapter 11 gives the rule. There is one setting for both sites and every phone. Below, a line names the point the forecast is read for, with "Last update: …", the time of the latest fetch, whether by the morning run, a dry run (chapter 15) or Today.

The next line is the morning run's record: "Last morning run: Tue 4 Nov, 06:41 · 3 tasks added, 2 waterings skipped after rain, 6 tasks tidied, 3 notifications to 1 phone" ("no phone has reminders on" when no phone is turned on; "the weather could not be fetched" when that step failed), or "Last morning run failed on …: …" with the error. Before 07:15 a day with no run yet reads "No run yet today." with the last run; after 07:15 it warns "No morning run recorded today (expected by 07:00)."; a run under way reads "started at 06:41, still running", and one that began and never ended says so. The line reads the record a real run writes; a dry run (chapter 15) leaves none.

### Language

**English** or **Français**, for this phone; the app reloads. Some text keeps its language:

- what Claude writes in Capture (evidence, advice), every profile and every diagnosis are in English, whatever the app's language (a diagnosis adds the derja word beside its key terms, chapter 6), and so are the task titles and instructions copied from a profile's calendar;
- the morning notifications, the notes the morning run writes on tasks ("Window ended", the rain note) and their dates follow the language chosen here, once chosen; the card reads "Notifications: Français" when the choice has reached the server, or says it has not yet, in which case it is sent again when the app opens with a connection. Until a language is chosen here, they are in English, as the server's error messages always are; on a phone with no choice of its own the card still reads the language another phone chose;
- a check before planting keeps the language it was written in, and Ask Claude answers in the language of the question;
- dates follow the phone's own regional format.

### Sites and zones

A list of zones for each site, offered first on the plant record form and in the planting check, and named to Claude in every planting check. Type a name under **New zone** and tap **Add**, tap a suggestion under "Used on plants, not listed yet:", or tap **Remove** beside one. Removing a zone changes no plant: plants keep their zone text. Zones cannot be renamed or reordered, and no site can be added.

### Export

**Export plants** and **Export tasks** download CSV files for Excel or Sheets, in UTF-8 with the Arabic names intact: plant-care-plants-<date>.csv and plant-care-tasks-<date>.csv, saved to Downloads. Column names and values are the database's own English words, whatever the app's language.

- **Plants**: one row per record, with the tag, quantity, species names (English, French, Arabic, Arabic in Latin letters), scientific name, cultivar, site, zone, latitude, longitude, planting date, source, rootstock, the ids and the creation time.
- **Tasks**: every task of every status, with the plant's tag, site and zone, the type, title, due date, window end, status, the time it was acted on, the note, the instruction, the rule key and the ids.

The exports cover the plants and the tasks only: not the profiles, diagnoses, questions, checks or photos.

### Claude usage

This month's Claude calls and last month's, added up by the functions as the calls are made: "November 2026: 23 calls, about $2.10", with the calls by kind beneath (identifications, profiles, diagnoses, questions, checks, derja word lists), the tokens in and out (thinking included), the calls that failed after Claude had spent tokens, and those a fallback model answered, counted at Fable prices. The last line gives the list prices the estimate uses: $10 per million tokens in, $50 out, $0.25 for a cache read, $12.50 for a cache write. The estimate is for Claude alone; Vercel and Supabase stay on their free tiers. A call that Vercel stops before it ends is the one thing the ledger misses; the Claude Console has the bill itself.

### Account, install, phase and version

"Signed in as" shows the account. **Sign out** forgets the sign-in on this phone only and does not stop the notifications, so turn Reminders off first if they should stop. Sign out needs a connection to stick: offline, an expired sign-in is kept and renewed later. The last cards say how to install the app, what this version does, and its number.

## 11. How the reminders work

### The morning run

Every morning the server:

1. fetches the forecast from Open-Meteo and stores it;
2. writes each plant's tasks for the next 90 days and tidies the stale ones;
3. skips the waterings due when the last two days' rain, or today's likely rain, reaches the setting (the rain skip, below);
4. writes its record: when it ran and what it did, which Settings → Weather shows (chapter 10) and Today watches from 06:05 (chapter 4);
5. sends each phone that turned reminders on a weather notification when there is something to say, then one notification for each site with something due, and adds their count to the record.

It is scheduled for 06:00 Tunis time (05:00 UTC; Tunisia has no daylight saving). On the Vercel plan the app runs on, it can start at any minute of that hour, so the notifications can come up to an hour late. Nothing needs to be open on the phone. If the weather step fails, that morning has no rain skip and no weather notification, while the tasks and the site notifications go ahead, and the record says the weather could not be fetched. If the task step fails, the run stops, no notification comes that morning, and the record carries the error. The notifications and the notes are written in the language chosen in Settings → Language, English until one is chosen.

### From a care rule to tasks

- **Age.** Each rule applies to establishment (under 24 months since planting), to mature plants (from 24 months) or to any age. A plant with no planting date counts as mature.
- **Months.** A rule's months are read as runs of consecutive months: April and October are two windows, while November to March is one across the new year.
- **Windows.** Every rule except a periodic watering makes one task per window, due on the 1st of its first month and open until the last day of its last month. A window already open when its task is first written shows at once as "Open since …".
- **Waterings.** A water rule with days between waterings makes a task every that many days, counted from the 1st of each run of months. Days already past are never written: a plant added on 10 June to a weekly June rule gets its first watering on 15 June. The litres go into the title, as in "Deep watering (40 L)".
- **Fixed days.** A watering's days come from the calendar, not from your last watering: a weekly June rule falls on the 1st, 8th, 15th, 22nd and 29th whatever day you water. A watering done two days late leaves the next one on its own day, and one done early does not bring the next forward. A snooze moves only the task you snooze, and closes the waterings it passes over.
- **How far ahead.** Tasks are written from today to 90 days ahead, never twice for the same plant, rule and day.
- **Groups.** A plant record of 12 gets one task per rule and day, not twelve.
- **Wording.** Tasks keep the words they were written with. A rule's new title, instruction or litres reach only the days written after the change: the tasks already written, up to 90 days ahead, keep the old ones, on Today and in the morning notification.

### What tidies itself

Each task refresh, at the morning run and at each of the app's own runs listed below:

- deletes the pending tasks whose rule no longer applies, because the rule was deleted, its type, months, age or days between waterings changed, a rewrite dropped it, or the plant changed stage. A new title, litres, warning or instruction deletes nothing. Deleted tasks leave no line in the journal;
- closes a window past its last day as skipped, with "Window ended" ("Fenêtre terminée" when the chosen language is French);
- closes the older waterings of a rule when a newer one is due, with "Superseded by the next watering", so a week away leaves one late watering per rule rather than one per interval;
- closes a rule's newest pending watering once a whole interval has passed with none newer, with "Missed watering". This is usually the season's last watering, but it can happen mid-season when the next one was done early or snoozed.

It never touches a task you did, skipped or snoozed, nor the tasks that a diagnosis or Log something done wrote; those stay until you act on them, except that the rain skip (below) can close a Water reminder you set. A snooze, though, writes a new pending copy on the new day, and a calendar task's copy is tidied like any other: a window closes as "Window ended" after its last day, which is the new day itself when the snooze stretched it; a watering closes as "Superseded by the next watering" or "Missed watering"; and either is deleted when its rule no longer applies. A window you already did is not reopened when its rule changes while the window is open, as long as you acted on it inside the new window.

### When the app writes tasks itself

Besides the morning run, tasks are written the first time Today opens in an app session, on Refresh, on Save plant and on Save in Edit record (for that plant), and when a care rule is saved or deleted (for every plant, as long as one plant uses the profile). A rewrite by Claude and a new position do not trigger it; they wait for the next of these. The app's own runs never skip waterings for rain and never send notifications, but they tidy as above.

### The morning notifications

- **Which tasks.** A site's notification holds its pending tasks that are due today or late, open windows included, reminders and follow-ups in their own words. It also carries a window's early notice, on the one morning exactly its days of warning before it opens: "From 1 Oct: Harvest olives · OL-01". Waterings get no early notice, and a window written after its notice morning gets only its due-date line.
- **Order.** Early notices first, then late tasks, then today's, then the open windows. Unlike Today, the notification orders its lines by urgency, not by kind of task: three lines grouped by kind would often all be waterings.
- **Lines.** The title counts the tasks ("Farm: 6 tasks"). The body shows up to three lines, each "title · tag", then "+N more". A zone's batch (chapter 4), for two plant records or more, shares one line: a round of waterings due now reads "Water 9 plants (20 L each) · row 2", and a window job "Scout for olive fly · 10 plants · row 2", or "From 1 Oct: Harvest olives · 10 plants · row 2" for its early notice. Its "9 plants" counts plants, a group by its size; the title and "+N more" count tasks. The litres show as a range when the amounts differ, and are left out when one is missing.
- **Weather.** A separate "Weather: …" notification comes first when there is an alert for today or tomorrow, or when the rain skip closed waterings. Its title names the first alert, and each alert has its own line.
- **The rest.** A site with nothing due sends nothing. Each morning's notification replaces the day before's of the same kind; a morning that sends none of a kind leaves the day before's in place until you clear it. The text follows the language chosen in Settings → Language, its dates too ("À partir du 1 nov."), and is English until a language is chosen there. A phone that is off gets them when it comes back on, if that is within 12 hours; after that, that morning's notifications are lost.

A tap on a notification opens Today. If the app is open on another screen, it reloads on Today and what was on that screen is lost, so finish a capture first. If Today is already open, it has read the run's result when the notification came.

### The weather

The forecast comes from Open-Meteo: free, with no key, and a model's estimate rather than a rain gauge. It is read for the mean position of the farm plants that have one within 30 km of Menzel Bouzelfa, or for the town itself, and it serves both sites, so the backyard's alerts, spraying hours and rain skip follow the farm's weather. Each fetch stores the seven days before today, today and the six days after. Diagnose, Ask Claude and Check before planting read the last seven days and the next three.

### Weather alerts

Temperatures, gusts and rain are compared rounded, as the card shows them.

| Alert | When | Advice for the day before | Advice on the day |
| --- | --- | --- | --- |
| Heat | 38 °C or more | "Water young plants deeply the evening before and shade the youngest; no pruning or spraying." | "Water young plants early, before the heat, and keep the youngest shaded; no pruning or spraying." |
| Sirocco | 34 °C or more, the day's lowest humidity at 25 % or less, and the main wind from the south (120° to 240°); it replaces Heat that day | "Hot, dry south wind: water young plants deeply the evening before, shade and shelter them; put off planting and spraying." | "Hot, dry south wind today: water young plants early, keep them shaded and sheltered; no planting or spraying." |
| Frost | 2 °C or less | "Cover frost-tender young plants at dusk and water the soil the day before." | "Look over frost-tender young plants this morning, and cover them again at dusk if the cold holds." |
| Gale | Gusts of 60 km/h or more | "Check the stakes and ties of young trees; pick ripe fruit before the wind." | "Check the stakes and ties of young trees; no pruning or spraying in the wind." |
| Heavy rain | 30 mm or more forecast | "Open the basin overflows and look for erosion; no watering needed." | The same |

Today shows the alerts for today and the next two days; the notification covers today and tomorrow. Alerts write no task, and a heavy-rain alert skips no watering by itself.

### Spray windows

A spray hour starts between 06:00 and 18:00, at 28 °C or cooler, with the wind up to 15 km/h, the gusts up to 25 km/h, and less than 0.5 mm of rain in that hour and the six after. An hour with no rain figure counts as wet. Two or more such hours in a row make a window, so every window ends by 19:00, and a day with a single good hour has none. The windows are worked out at each fetch for today and the next two days, and Today shows today's and tomorrow's when something calls for a spray (chapter 4).

### The rain skip

At the morning run, when "Skip waterings after rain" is On, the waterings are skipped if either holds:

- the rain of the two days before today adds up to the threshold or more;
- today's forecast reaches the threshold with a chance of 70 % or more. The forecast is compared exactly, so a day the card shows as "10 mm" may be just under 10 mm and skip nothing at 10 mm.

The periodic waterings due today or late then close as skipped, at both sites, with the note "Rain: 14 mm in the last two days" or "Rain forecast today: 12 mm". That includes a Water reminder you set. Watering windows, and waterings due after today, keep their dates. Today's weather card and the weather notification say how many were skipped. A watering the skip closed cannot be reopened; if you water anyway, log it on the plant with **Log something done** (Water, **Done today**), or its journal shows only the skip.

Only the morning run skips; Refresh and the weather card never do. If the setting cannot be read, nothing is skipped that morning, so a skip you turned off is never turned back on by mistake. Before the settings table exists (chapter 15), the run uses the defaults, On at 10 mm, and Settings cannot turn it off.

The model's rain is an estimate. After a skip, check that the soil really got wet, and water if it did not. A local shower the model missed skips nothing, and the waterings stay on Today: check the soil, and skip them yourself if it is wet enough.

## 12. Without a connection

The app itself is stored on the phone, so it opens and moves between screens without a signal, even when the sign-in has run out (chapter 3): it then opens on what the phone kept, and the sign-in comes back with the signal. What the phone keeps, and what it does not:

- Today keeps the last list it read, and shows it under today's date with "Shown as of …" (chapter 4); the weather card keeps its last rows; the Today badge counts the kept list;
- Done and Skip on Today are kept on the phone and sent when the connection returns, with the time of the tap (chapter 4); Snooze is not;
- every other list (Plants, Species, a plant's page) is read from the online database each time; without a connection it shows "Loading…" for a few seconds, then its error with **Retry**;
- the other saves and the Claude calls fail, and nothing else waits to be sent later; only a species profile is slow to fail, since the app keeps looking for it for up to 5 minutes, so a check of a typed name stays that long on "Finding the species (a new one is profiled first)…" (leave the screen to stop it);
- the photos the phone has already shown or taken, about 500, stay on it, so on a weak signal they show at once; without one they show only on a page already open when the signal went, and the others show a sprout;
- the app keeps no map tiles, so a map opened offline is blank;
- the language switch works offline; the server learns of it at the next open with a connection;
- a kind's list on a Today already shown can still be shared: WhatsApp or SMS sends it when the signal returns.

When the signal is back, tap **Retry** or move to another screen; Today's saved actions go out by themselves.

On a weak mobile signal, long Claude calls keep their connection alive so that the reply is not dropped, and every Today write gives up after 8 seconds rather than hang. If a reply is lost anyway, it is looked for rather than paid twice: a new species profile when it was asked for by its scientific name (a confirmed candidate, or **Check this one**) or by a typed name that is exactly one of its names (chapter 5); a question, a check or a diagnosis by the row the server writes as soon as Claude has answered (chapters 6 and 9), for up to five minutes, with the panel saying so and Close available. An identification has to be sent again, and that is a new call. A rewrite from **Regenerate from Claude** is not looked for, but the server may still finish it: reopen the profile after a few minutes before regenerating again, since a second rewrite is paid again (chapter 8).

## 13. What the Claude calls cost

Every call runs on Claude Fable 5.1. When Fable declines, Anthropic's fallback model answers where one exists for that kind of request. The figures below are the estimates in `docs/DECISIONS.md`, at $10 per million input tokens and $50 per million output tokens; Claude's thinking counts as output.

| Call | When | About |
| --- | --- | --- |
| Identification | Each photo sent from Capture, each Retry and each second photo | 5 cents |
| New species profile | A species new to the library, a typed name that is not an exact match, a rewrite | 15 cents |
| Diagnosis | Each Send to Claude | 5 to 10 cents |
| Derja words | Each Get derja words or Refresh words on a species | 5 to 10 cents (an estimate, not yet measured) |
| Question | Each Ask | 9 to 18 cents |
| Planting check | Each Check | 10 to 18 cents, plus about 15 cents for a new profile when the name is not an exact match of a stored one |

The weather adds a fraction of a cent to a diagnosis, a question or a check. Everything else is free: the daily round, the morning run, the notifications, the weather, the map, the tags, the exports, and a second plant of a species already profiled, which pays only for its identification. A plant is only ever added through Capture, after a photo and its identification.

Each answer shows "Usage: N in / M out tokens". "In" leaves out the cached part of the input, "out" includes the thinking, and a call retried after being cut short shows both attempts together. A call that fails after Claude has worked on it, such as "Claude output was cut at …", shows no usage line, although it was paid; a reply lost on the way is looked for and, when found, shows its usage (chapter 12). A new profile that Capture finds again after a lost reply shows "Usage: 0 in / 0 out tokens", although it was paid too. A profile refused in Capture, and a refused rewrite, show no usage line, although they were paid. An error before Claude is reached, such as "Signed out. Sign in again." or "Server is not configured: …", costs nothing. Settings → Claude usage (chapter 10) adds up the month's calls and their estimated cost from the tokens the functions record, the failed and refused calls included; the Claude Console's usage page has the bill itself.

## 14. Messages and what to do

| Message | What it means | What to do |
| --- | --- | --- |
| "A new version is ready." | An update has downloaded. | Finish what you are doing and tap **Reload**. |
| "This account is not listed as the owner, so the tables are closed to it. …" | The signed-in account has no row in the owners table, so lists read empty and saves fail. | Sign out and sign in with the owner's account, or add this one (chapter 15), then reopen the app. |
| "This account is not the owner of this app" | The server accepts only the account named as the owner. | Sign in with the owner's account. If it already is, the owner id in Vercel is wrong (chapter 15). |
| "Sign-in failed: Invalid login credentials" | The email or the password is wrong. | Type them again. |
| "Signed out. Sign in again." | The server no longer accepts the sign-in, or, offline, the phone could not renew it. | Sign in again, or retry once there is signal. |
| "Network error. Check the connection and try again." | A Claude call got no complete answer, or a list could not be read or a change could not be sent, usually for lack of a connection: Save plant, the diagnosis photo, Today's list, Settings, a species page, the sign-in; or Refresh, or Turn on or off, waited 30 seconds without an answer. | Find signal and try again; **Save plant** and **Save again** write into the same plant and photo. A new profile, a question, a check and a diagnosis are looked for by themselves, and a Refresh may have finished on the server anyway. Where there is no **Retry**, as in Settings or on a species page, leave the screen and open it again. |
| "The derja words could not be read. They will show when the connection is back." | A profile's words could not be read, for lack of a connection. The button is hidden so a list is not paid for twice. | Nothing; the card reads again when the signal returns. |
| "Your own words could not be read; showing Claude's" | On a diagnosis, your corrections could not be read. | Nothing; reopen the diagnosis once there is signal. |
| "The words could not be fetched: …" | Get derja words or Refresh words did not complete. If the server finished, the list is found when you open the species again. | Open the species again; tap the button only if the list is still missing. |
| "Offline · Shown as of 19:12, not updated · 2 actions waiting" | Today shows the list kept on the phone, and holds actions made without a connection (chapter 4). | Nothing: the list is read and the actions sent when the signal returns, or tap **Retry** and **Send now**. |
| "Done: … · saved on the phone" | The Done or Skip is kept on the phone until the connection returns. | Nothing; **Undo** takes it back while it waits. |
| "1 saved action was not applied: the task had been closed meanwhile." | A task done offline had been closed from another screen before the action was sent. | Check the plant's journal; log the care with **Log something done** if it is missing. |
| "The saved actions could not be sent: …" | The phone is online but the actions failed to reach the server, or a batch was written in part and the check after it failed; what was written has left the list (a Done counts in the round). | Tap **Send now** again later; what did not go through is kept. |
| "Snooze needs a connection." | A snooze was tapped without a connection, or its writes hung. | Snooze once there is signal. |
| "The connection dropped while Claude was answering. Checking whether the answer has arrived…" (and the same for a check or a diagnosis) | The reply was lost on the way; the server saves the answer when Claude is done, and the app looks for it for up to five minutes. | Wait, or close: the answer reaches the journal by itself. |
| "No answer was found. The call may have been declined or lost; asking again is a new call." | Nothing arrived within five minutes after a lost reply, for a question, a check, a diagnosis or a new profile: Claude may have declined (a refusal is not saved) or the call was lost. | Ask again if you still want the answer; it is a new paid call. A profile may have arrived meanwhile: **Retry the profile** finds it first when its name matches. |
| "Error: 400 {"type":"error",…}", or "Error:" with another number and the same kind of text | Claude's service refused the call. "credit balance is too low" means the Claude account has run out of credit; "authentication_error", that the Claude key in Vercel is wrong; "overloaded_error" or "rate_limit_error", that Claude is busy. Nothing is saved. | Add credit in the Claude Console, or fix the key (chapter 15). When Claude is busy, try again in a few minutes. |
| "Server is not configured: … is missing" | A server setting is missing in Vercel. | Add it in Vercel and redeploy (chapter 15). |
| "Claude output was cut at … tokens; try again" | Claude's answer did not fit. When there was time left, the app had already tried once more with twice the room. | Try again. |
| "Request timed out." or "Connection error." | The server ran out of time for the Claude call, or could not reach Claude. | Try again later. |
| "Claude declined this request", "Claude declined this question", "Claude declined this check: …" or "Claude declined to write a profile for this name: …" | Claude, and the fallback model where there is one, refused. No answer is saved; a profile written just before a declined check stays in the library. | Try another photo or other words. |
| "The database returned nothing" | A save came back empty, or, in Ask Claude and the planting check, Claude's reply could not be read. | Try again. |
| "The photo is too large" | The request was too big for the server. | Take the photo again. |
| "Could not read the photo: …" | The phone could not open or shrink the photo, and nothing was sent. | Try another photo, in Chrome. |
| "The task could not be updated: …" | A Done, Skip or Snooze was not saved. After a Snooze, "This task was already acted on" means it was closed elsewhere first. | On Today, tap **Retry**, then try again; on a plant's page, try again. After "This task was already acted on" there is nothing to redo: the task is closed. |
| "No free day to move it to" | The day you chose and the seven days after it all hold a done, skipped or snoozed copy of this task. | Do or skip the task, or snooze it by more days. |
| "That task had already been closed …" | The rain skip or another screen closed it first. | Nothing: the list is up to date. |
| "The tasks could not be refreshed: …" | Refresh failed. | Try again later; the morning run writes the tasks anyway. |
| "The settings table does not exist yet. …" | A Phase 5 setup step is missing. | Run the SQL it names (chapter 15). |
| "Answers are not kept yet: the questions table does not exist. …" | Ask still answers, but keeps nothing. | Run the Phase 6 SQL (chapter 15). |
| "Checks are not kept yet: the planting_checks table does not exist. …" | The check still answers, but is not kept. | Run the Phase 7 SQL (chapter 15). |
| "The weather is not kept yet: the weather_days table does not exist. …" | No forecast can be stored. Today's weather card stays hidden, the morning run skips no watering after rain and sends no weather notification, even with "Skip waterings after rain" On, and Diagnose, Ask Claude and the planting check get no weather. | Run the Phase 8 SQL (chapter 15). |
| "Street map only: the satellite view needs a TomTom key …" | No satellite key is built into the app. | Place trees on the street map, or add the key (chapter 15). |
| "The satellite view did not load …: street map shown." | No connection, a wrong key, or the month's free tiles used up. | Close the map and try again later. |
| "Supabase keys are missing. …" | The app was built without its database settings. | Add them in Vercel and redeploy (chapter 15). |

## 15. Setup and administration

This chapter is for the owner. The keys never pass through a chat: you add them yourself.

### What the app needs

| Value | Where it comes from | Where it goes | Secret? |
| --- | --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The Supabase project's settings | Vercel and `.env.local` | The service-role key is secret: it gets past every table rule. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The same project URL, and its anon key | Vercel and `.env.local` | Built into the app and public by design; the owner-only table rules protect the data. |
| `OWNER_USER_ID` | Your user's UUID, under Supabase → Authentication → Users | Vercel and `.env.local` | Not secret, but required. |
| `ANTHROPIC_API_KEY` | platform.claude.com | Vercel and `.env.local` | Secret. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`; the subject is `mailto:` and your address | Vercel and `.env.local` | The private key is secret. |
| `VITE_VAPID_PUBLIC_KEY` | The same public key again | Vercel and `.env.local` | Built into the app. |
| `CRON_SECRET` | Any long random string | Vercel and `.env.local` | Secret: the password of the morning run. |
| `VITE_TOMTOM_API_KEY` (optional) | my.tomtom.com, Map Display API | Vercel | Built into the app, and locked to the app's domains. |
| `VITE_ARCGIS_API_KEY` (optional) | ArcGIS Location Platform, Basemaps | Vercel | Built into the app; lock it to the app's address in the ArcGIS portal. Used only when the TomTom key is blank. |

The names are in `.env.example`. Vercel gives a changed value only to deployments made after the change, so redeploy after every change. Every `VITE_` value is built into the app, so the phone also needs **Reload** after the deploy. The Claude organisation must keep the default 30-day data retention; under zero data retention every call fails. The weather needs no key.

### A new installation

1. **Supabase.** Create a project in West EU (Ireland): `vercel.json` runs the functions in Dublin beside it, and a project elsewhere needs `regions` there set to the Vercel region nearest it. In the SQL editor, run `supabase/schema.sql` once; it is for a new project only. If the run ends with a notice about the "owner photos" policy, add that policy from Storage → Policies: bucket `photos`, all operations for authenticated users, with both expressions set to `bucket_id = 'photos' and is_owner()`.
2. **The owner.** Under Authentication, create one user with an email and a password. In the SQL editor, run `insert into owners (user_id) select id from auth.users where email = '<your email>';` and check it with `select count(*) as owners from owners;`, which must say 1. If it says 0, the email did not match the user's: correct it and run the `insert` again. Under Sign In / Providers, turn off "Allow new users to sign up".
3. **Claude.** Create an API key at platform.claude.com.
4. **Web Push.** Generate a key pair once with `npx web-push generate-vapid-keys`.
5. **Vercel.** Create a project from the repository and add the values above for Production and Preview, then redeploy. Check that Settings → Cron Jobs lists `/api/daily` at `0 5 * * *`. Vercel runs the cron on the production deployment only.
6. **The phone.** Install the app, sign in and turn on Reminders (chapter 3).

The owners row and `OWNER_USER_ID` must name the same account. The row opens the tables and the photos; the variable opens the Claude, task, weather and reminder routes.

### Bringing an older project up to date

A project set up phase by phase does not run `schema.sql` again. Run the SQL from the Setup section of each of these files once, in this order: `PHASE5.md` (settings), `PHASE6.md` (questions, and the journal closed to the public key), `PHASE7.md` (planting checks), `PHASE8.md` (weather), then `PHASE10.md` (the owners table, with your email in its insert). The last line of the Phase 10 SQL must say 1. Phases 2, 3, 4, 9, 11 and 12 need no SQL.

Do not run the SQL of Phase 6, 7 or 8 again after Phase 10: each run sets its table back to "any signed-in account". If one was run again, run the Phase 10 SQL again.

### Check that only the owner gets in

In the Supabase SQL editor, this must say 0:

```sql
set role anon; select count(*) from journal; reset role;
```

this must say 1:

```sql
select count(*) as owners from owners;
```

and this must show `is_owner()` on every line but the owners one:

```sql
select tablename, qual from pg_policies where schemaname = 'public' order by tablename;
```

A line that reads `true` is a table set back to "any signed-in account": run the Phase 10 SQL again. "Allow new users to sign up" must be off, and Storage → Policies must show only the "owner photos" policy on the `photos` bucket, with `is_owner()` in both expressions.

### Check the morning run

A dry run composes everything and sends nothing. In PowerShell, type `curl.exe` instead of `curl`.

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://plant-care-phi-fawn.vercel.app/api/daily?dry=1"
```

The answer gives the Tunis date, the number of plants, the tasks added and removed, the windows and waterings closed, each site's notification, and the weather part: whether the forecast came in, what the rain would skip, and the weather notification. In a dry run the counts of notifications and subscriptions always read 0. The weather notification reads as if the waterings had been skipped, but each site's notification still lists them, while a real run closes them first and leaves them out.

A dry run is not read-only: it stores the forecast and writes and closes tasks as a real run does, holding back only the rain skip, the sending and the record. It shows what a run would do at that moment, not what the morning run did. That is read from the run's record: Settings → Weather shows it (chapter 10), and the settings table holds it as `daily:last` (`at`, the date, the counts, the pushes sent and failed, the phones they went to, a weather or digest error, or the error that stopped the run), with `daily:started` marking the start of the last run. A call without `?dry=1` is a full second run: the notifications go out again, and the record is that second run's.

### What the Vercel logs show

On the Hobby plan the runtime logs reach back about an hour. The app logs a notification a push service refused ("push failed: status …", with "VAPID key does not match this subscription" for a 403), and an error with no status of its own, such as a database failure that stopped a morning run, a Claude call that ran out of time or a missing Claude key. It logs nothing on success. It also logs nothing for an error Claude answered (such as the 400 under zero data retention), a missing Supabase or owner setting ("Server is not configured: …"), a forecast or rain skip that failed at 06:00, or a missing push key: those show only on the phone or in the run's answer. A Claude call longer than 10 seconds answers 200 first and carries any later error inside the reply. To know whether the server finished a call whose reply the phone lost, look at the table itself.

### Rotate a key or change the owner

- **Web Push keys.** Generate a new pair, and replace `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VITE_VAPID_PUBLIC_KEY` (the same new public key). Redeploy, tap **Reload** on each phone, then **Turn on** again, since Settings reads Off under the new key. A phone that has not done this gets nothing. If the two public keys differ, the card still reads On but every notification is refused.
- **Missing push keys.** If the server's keys are missing, Turn on still works and nothing is sent. A real run's answer says so, as `digest_error`, and so does its record on the Settings → Weather line, on a morning with something to send to a phone that is turned on. The logs show nothing.
- **Any other key.** Replace it in Vercel and in `.env.local`, then redeploy. A new `CRON_SECRET` is the one Vercel sends from then on.
- **The owner.** Create the new user and add its row to `owners`, then remove the old row (or the old user). Set `OWNER_USER_ID` to the new UUID and redeploy. Sign out and sign in with the new account; the reminders belong to the phone and keep working.

### An Arabic keyboard for the derja words

Correcting a derja word on a diagnosis (chapter 6) needs Arabic letters, and nothing in the app can switch the phone's keyboard. In Gboard: Settings → Languages → Add keyboard → Arabic. The globe key then switches between the keyboards; ڨ, ڥ and پ are under a long press on ق, ف and ب. Your corrections are kept in the `settings` row `derja`; no SQL is needed.

### The satellite map (optional)

1. Sign up at my.tomtom.com; it is free and asks for no card. Do not add prepaid credit: without it, use past 200,000 tiles a month is refused, never billed.
2. Give the key the Map Display API, and set its allowed domains to the app's address and `localhost`.
3. Add `VITE_TOMTOM_API_KEY` in Vercel for Production, redeploy, and tap **Reload** on the phone.
4. If the map falls back to the street map right after you set the domains, write them with `https://`, or clear the list.

The key does not expire; TomTom ends the free agreement after 90 days without use. An ArcGIS Location Platform key in `VITE_ARCGIS_API_KEY` also works when the TomTom key is blank.

### Work on the app on a computer

Copy `.env.example` to `.env.local` and fill in the same values; the file is git-ignored. Without the two `VITE_SUPABASE_` values the app opens on "Supabase keys are missing. …". Then, with Node 24 (as `engines` in `package.json` says):

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` serves the app only; the functions run on Vercel, or locally with `vercel dev`. Before every commit, `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` must pass. `CLAUDE.md` holds the working rules and `README.md` the commands.

## 16. Limits

- One account and two fixed sites. A helper or a third site would be a change to the app.
- Work is not assigned to a person in the app, and helpers have no account. A kind's list goes out as a one-way copy (chapter 4), framed in the app's language with titles and instructions as the profile wrote them. Nothing done from it comes back on its own.
- Identification, profiles, diagnoses, questions and checks need a connection. Today keeps its last list and takes Done and Skip without one; the other lists are not kept on the phone, and nothing else waits to be sent.
- The morning notifications come once a day, at 06:00 Tunis time or up to an hour later, and the hour cannot be changed in the app. Web Push is the only channel; there is no email.
- The identifications, the profiles and the diagnoses are in English whatever the app's language, and so are the task titles copied from a profile. The notifications and the morning run's notes follow the language chosen in Settings, English until one is chosen. A check before planting is written in the app's language, and Ask Claude answers in the language of the question.
- A diagnosis sends one photo, and Ask Claude takes none.
- A plant is added only through Capture, after a photo and its identification: there is no form to add one by name alone.
- There is no bulk move of plants to a zone, and no filter by zone or species beyond the search.
- A plant cannot be moved to another species: delete it and capture it again. A plant has no cultivar of its own; it shows its profile's.
- The care calendar belongs to the species: no plant can have a schedule of its own.
- Once you edit any part of a profile, the care calendar and the pests included, a rewrite by Claude no longer refreshes that part, and the app has no button to hand it back.
- A journal entry cannot be deleted, and a task closed by mistake cannot be reopened once its Undo is gone. Only a problem photo opens larger, with its diagnosis; the other journal photos stay small, apart from the newest at the top of the plant's page.
- Only the newest planting check of a species can be opened again.
- No screen lists every plant's tasks beyond the coming week: a plant's Calendar tab shows its next twelve, and **Export tasks** holds them all.
- The rain is Open-Meteo's model, not a gauge, and one forecast serves both sites.
- The Plants list, the map and the tag sheet read up to 1,000 plant records, and Today reads up to 1,000 tasks for its week.
- The exports hold the plants and the tasks only; there is no other backup in the app.
