# Session Extraction JavaScript

Use `mcp__Claude_in_Chrome__javascript_tool` to run this code on the loaded page. It extracts all sessions from the availability table with their computed text colors for status detection.

```javascript
var table = document.querySelector('table');
var rows = table.querySelectorAll('tr');
var sessions = [];
for (var i = 1; i < rows.length; i++) {
  var cells = rows[i].querySelectorAll('td');
  if (cells.length >= 3) {
    var dateCell = cells[0];
    var sessionCell = cells[1];
    var arenaCell = cells[2];
    var dateSpan = dateCell.querySelector('span');
    var dateText = dateCell.textContent.trim();
    var color = dateSpan ? window.getComputedStyle(dateSpan).color : 'unknown';
    var status = 'available';
    var isSpecialEvent = color.indexOf('255, 255, 0') !== -1;
    if (color.indexOf('255, 0, 0') !== -1) {
      status = 'sold_out';
    } else if (color.indexOf('255, 153') !== -1 || color.indexOf('255, 165') !== -1) {
      status = 'limited';
    } else if (isSpecialEvent) {
      status = 'special_event';
    }
    var arenaText = arenaCell.textContent.trim();
    var sessionText = sessionCell.textContent.trim();
    if (arenaText.indexOf('(FULL)') !== -1) {
      status = 'sold_out';
    }
    if (sessionText.indexOf('Space is Limited') !== -1 || sessionText.indexOf('Limited') !== -1) {
      if (status !== 'sold_out') status = 'limited';
    }
    sessions.push({
      date: dateText,
      session: sessionText,
      arena: arenaText,
      status: status,
      isSpecialEvent: isSpecialEvent
    });
  }
}
JSON.stringify(sessions);
```

## What the code does

1. Finds the first `<table>` on the page (the availability table)
2. Iterates rows (skipping the header)
3. For each row with 3+ columns, reads: date, session description, arena/location
4. Gets the computed color of the `<span>` inside the date cell
5. Maps color to status: red = sold_out, orange = limited, yellow = special_event, black/other = available
6. Checks text overrides: "(FULL)" forces sold_out, "Limited" forces limited (unless already sold out)
7. Returns a JSON array of all sessions

## Color matching details

The orange detection checks for both `255, 153` and `255, 165` because browsers may render slightly different shades. Yellow (`255, 255, 0`) indicates a special event row that needs extra attention -- check the text for actual availability information.
