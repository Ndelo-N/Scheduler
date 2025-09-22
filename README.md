# Student Shift Scheduler - User Manual

## Table of Contents
1. [Getting Started](#getting-started)
2. [Loading Student Data](#loading-student-data)
3. [Setting Up the Schedule](#setting-up-the-schedule)
4. [Running the Scheduler](#running-the-scheduler)
5. [Managing Shifts](#managing-shifts)
6. [Student Swapping](#student-swapping)
7. [Admin Override Mode](#admin-override-mode)
8. [Save and Load Schedule States](#save-and-load-schedule-states)
9. [Exporting and Printing](#exporting-and-printing)
10. [Troubleshooting](#troubleshooting)
11. [Monthly Workflow](#monthly-workflow)
12. [Tips for Success](#tips-for-success)
13. [Keyboard Shortcuts](#keyboard-shortcuts)
14. [Contact and Support](#contact-and-support)

---

## Getting Started

### Opening the Scheduler
1. Open your web browser (Chrome, Firefox, or Edge work best)
2. Navigate to the scheduler file: `Scheduler_Enhanced.html`
3. Double-click the file to open it in your browser
4. You should see a dark-themed interface with the title "StudentShiftScheduler Enhanced"

### Understanding the Interface
The scheduler has several main areas:

- **Top Header**: Quick action buttons for common tasks
- **Left Panel**: Controls for setting up students, dates, and rules  
- **Right Panel**: The calendar view showing the schedule
- **Bottom Panel**: Summary information and additional controls

---

## Loading Student Data

### Method 1: Load Sample Data (For Testing)
1. Click the **"Load sample"** button in the top header
2. This loads 5 test students with sample availability
3. Use this to practice before loading real student data

### Method 2: Import from CSV File
1. **Prepare your CSV file** with student information
2. Click **"Choose File"** next to the CSV import section
3. Select your CSV file from your computer
4. Click **"Import CSV"**
5. The system will process the data and show a success message

#### CSV File Format
Your CSV file should have these columns:

| Column | Description | Example |
|--------|-------------|---------|
| **id** | Student ID number | `1` |
| **name** | Full student name | `John Smith` |
| **weekly_max_hours** | Maximum hours per week | `18` |
| **contracted_monthly_hours** | Total hours for the month | `72` |
| **color** | Color code for the student | `#FFB3BA` |
| **avatar_url** | (Optional) URL to student's photo | `https://example.com/photo.jpg` |
| **availability** | Student's weekly schedule and unavailable dates | `{"weekly":[...],"unavailable_dates":[...]}` |

#### Student Avatars
- **Avatar URLs**: Include a link to the student's photo in the `avatar_url` column
- **Fallback**: If no avatar is provided, the system shows a colored dot
- **Display**: Avatars appear on student chips and in the "Add Student" modal
- **Format**: Use standard image URLs (JPG, PNG, etc.)

### Method 3: Add Students Manually
**Note**: Manual student entry has been removed to streamline the interface. Use CSV import for adding students, or modify the sample data as a starting point.

---

## Setting Up the Schedule

### Step 1: Select Month and Year
1. In the **"Year"** field, enter the year (e.g., 2025)
2. In the **"Month"** dropdown, select the month
3. The calendar will update to show the selected month

### Step 2: Configure Operational Hours
1. Go to the **"Operational Hours"** section
2. Set **Default start time** (usually 06:00)
3. Set **Default end time** (usually 19:00)

#### Adding Public Holidays
1. In the **"Public holidays"** text area, add holidays in this format:
   ```json
   [{"date":"2025-12-25","name":"Christmas Day"}]
   ```
2. Click **"Update operational hours"**

#### Adding Special Hours
1. For days with different hours (like early closing):
   - Select the **date**
   - Set **start time** and **end time**  
   - Add a **name** (like "Early Closing")
2. Click **"Add"**
3. Click **"Update operational hours"**

#### Adding Batch Holidays (School Breaks)
1. For extended breaks:
   - Select **start date** and **end date**
   - Add a **name** (like "Winter Break")
2. Click **"Add"**
3. Click **"Update operational hours"**

### Step 3: Set Up Assessment Periods
1. Go to **"Assessment Periods"** section
2. Click **"Add Assessment Period"**
3. Enter:
   - **Name**: Like "Midterm Exams"
   - **Start date** and **End date**
4. Click **"Add"**

> **💡 Assessment Period Logic**: During assessment periods, the scheduler disregards students' regular weekly availability and only applies test-specific rules (no work before tests, +1 hour after tests). This allows for more flexible scheduling during exam periods.

### Step 4: Configure Test Shifts
1. Go to **"Test Shifts"** section
2. For each test:
   - Select the **date**
   - Set **start time** and **end time** (e.g., `08:00-10:00`)
   - Enter **test name**
   - Set **required assistants** (how many students needed)
3. Click **"Add Test Shift"**

### Step 5: Set Monthly Contract Targets
1. In **"Monthly Contract Targets"** section
2. Set the **default monthly target** (usually 72 hours)
3. Click **"Apply to all students"**

### Step 6: Choose View Mode
1. **Single Month View** (default): Shows only the selected month
2. **3-Month View**: Shows current month plus previous and next months
   - Click **"3-Month View"** in the top header to toggle
   - Useful for seeing patterns across multiple months
   - Automatically generates schedules for all 3 months when you click **"Run Scheduler"**

---

## Running the Scheduler

### Step 1: Generate the Schedule
1. Click **"Run Scheduler"** in the top header
2. The system will:
   - Create shift slots for each day
   - Apply test shift requirements
   - Assign students based on availability and **weekly consistency**
   - Show progress in the algorithm logs

> **💡 Weekly Consistency**: The scheduler prioritizes students who already work the same weekday at the same time, creating predictable patterns. For example, if Alice works Monday 14:30-15:30 in Week 1, she'll be prioritized for Monday 14:30-15:30 in future weeks.

### Step 2: Review the Results
1. Check the calendar view for assigned shifts
2. Look for any empty shifts (showing "Click to add students")
3. Review the algorithm logs for any issues

### Step 3: Fill Empty Shifts
1. Click **"Fill Open/Close"** to prioritize opening and closing shifts
2. For remaining empty shifts, click on them to add students manually

### Step 4: Rebalance if Needed
1. Click **"Rebalance"** to improve fairness
2. This redistributes hours more evenly among students
3. You can run rebalance multiple times if needed

---

## Managing Shifts

### Adding Students to Shifts
1. **Click on any empty shift** (showing "Click to add students")
2. A popup will show available students with indicators:
   - ✅ **Available**: Student can work this shift
   - 🔒 **Not available**: Student cannot work this shift
3. Click on an available student to assign them
4. The shift will update to show the assigned student

### Removing Students from Shifts
1. **Right-click on a student's name** in a shift
2. Select **"Remove from shift"** from the menu
3. Confirm the removal

### Adjusting Shift Capacity
1. **Right-click on a shift** (on the time, not a student)
2. Select **"Adjust capacity"**
3. Enter the new required number of assistants
4. The shift will update to show the new capacity

### Drag and Drop
1. **Drag a student's name** from one shift to another
2. The system will automatically:
   - Remove them from the original shift
   - Add them to the new shift (if possible)
   - Show an error if the move isn't allowed

> **⚠️ Note**: Students with 🔒 cannot be dragged (they're locked due to availability)

---

## Student Swapping

### Initiating a Swap
1. **Right-click on a student's name** in any shift
2. Select **"Swap/Replace"** from the menu
3. A popup will show other students who can take this shift

### Completing a Swap
1. Click on the student you want to replace them with
2. The system will:
   - Remove the original student
   - Add the new student
   - Record a "debt" (who owes whom a shift)

### Managing Swap Debts
1. Check the **"Swap Debts"** section in the left panel
2. You'll see a list of who owes shifts to whom
3. When students work off their debts, click **"Mark settled"**

---

## Admin Override Mode

### What is Admin Override Mode?
Admin Override Mode allows administrators to bypass all scheduling restrictions when making manual assignments. This is useful for emergency situations or when you need to make assignments that would normally be blocked by the system.

### Enabling Admin Override Mode
1. Click **"Enable Admin Mode"** in the top header
2. The button will turn red and show **"Disable Admin Mode"**
3. You'll see a warning message: **"🔧 Admin Mode ENABLED - All restrictions bypassed"**

### Using Admin Override Mode
When Admin Mode is enabled:
- **All restrictions are bypassed**: You can assign students regardless of availability, hour limits, or conflicts
- **Visual indicators**: Overridden shifts show a 🔧 badge
- **Drag-and-drop works**: You can drag any student to any shift
- **Audit trail**: All admin overrides are logged with timestamps

### Visual Indicators
- **🔧 Badge**: Appears on shifts that have been overridden
- **Orange border**: Admin-overridden shifts have a distinctive orange border
- **Pulsing animation**: Drop targets show a pulsing orange border when dragging

### Disabling Admin Override Mode
1. Click **"Disable Admin Mode"** in the top header
2. The button returns to normal color
3. Normal scheduling restrictions are restored

> **⚠️ Important**: Use Admin Override Mode sparingly. It bypasses important safety checks and should only be used for legitimate administrative needs.

---

## Save and Load Schedule States

### Saving Your Work
The scheduler can save your complete work state, including:
- All student data and settings
- The current month/year selection
- All shift assignments
- Assessment periods and test shifts
- Operational hours and holidays

### How to Save
1. Click **"Save"** in the top header
2. A JSON file will download with your complete schedule state
3. The filename includes the month/year and date (e.g., `schedule_2025_09_2024-12-15.json`)

### Loading Saved Work
1. Click **"Load"** in the top header
2. Select your saved JSON file
3. A confirmation dialog will show:
   - The month/year of the saved schedule
   - Number of students
   - Number of shifts
4. Click **"Yes"** to load the schedule
5. Your complete work state will be restored

### When to Use Save/Load
- **Backup before major changes**: Save before making significant modifications
- **Resume work later**: Load a previous state to continue working
- **Share schedules**: Send saved files to colleagues
- **Version control**: Keep multiple versions of schedules
- **Recovery**: Restore work if something goes wrong

### File Management Tips
- **Use descriptive names**: The system adds timestamps, but you can rename files
- **Keep backups**: Save multiple versions for important schedules
- **Organize by month**: Create folders for different months or semesters
- **Regular saves**: Save your work frequently to avoid losing progress

---

## Exporting and Printing

### Exporting to CSV
1. Click **"Export CSV"** in the top header
2. A file will download with all shift assignments
3. **In 3-Month View**: Exports data for all 3 months with month column
4. This can be opened in Excel or Google Sheets

### Exporting Individual Calendars
1. Click **"Export ICS"** in the top header
2. This creates calendar files for each student
3. **In 3-Month View**: Creates calendar files covering all 3 months
4. Students can import these into their personal calendars

### Printing the Schedule
1. Click **"Print"** in the top header
2. The system will:
   - Hide unnecessary controls
   - Show only the calendar
   - Use colors that print well
   - **In 3-Month View**: Print all 3 months with proper page breaks
3. Use your browser's print dialog to print or save as PDF

### Creating Visual Timetables
1. First export your schedule as CSV
2. Save the CSV file in the same folder as `MakeTTBL.py`
3. Rename it to `schedule.csv`
4. Run the Python script to generate a visual timetable
5. This creates both PNG and PDF versions

---

## Troubleshooting

### Common Issues and Solutions

#### "No shifts being filled"
- **Check student availability**: Make sure students have time slots that match the shift times
- **Check operational hours**: Ensure the facility is open during shift times
- **Check test conflicts**: Students can't work before tests or within 1 hour after

#### "Student shows as not available"
- **Check weekly schedule**: Student's availability must include the shift time
- **Check test dates**: Student might have a test on that day
- **Check hour limits**: Student might have reached weekly or monthly limits

#### "Cannot drag student"
- **Look for 🔒 icon**: This means the student isn't available at that time
- **Check conflicts**: Student might have overlapping shifts
- **Check capacity**: Shift might be full

#### "Algorithm logs show errors"
- **Check CSV format**: Make sure all required columns are present
- **Check date formats**: Use YYYY-MM-DD format for dates
- **Check time formats**: Use HH:MM format for times (24-hour)

#### "3-Month View not showing data"
- **Check if schedules exist**: Make sure you've run the scheduler for the months you're viewing
- **Switch to single month**: Try single month view first to verify data exists
- **Check month range**: Ensure the months you're viewing have operational days
- **Run scheduler in 3-month mode**: Click "Run Scheduler" while in 3-month view to generate all months

### Getting Help
1. **Check algorithm logs**: Scroll down to see detailed information
2. **Use validation**: Click **"Validate"** to check for issues
3. **Save your work**: Use **"Save"** to backup your progress
4. **Load previous work**: Use **"Load"** to restore a backup
5. **Use Admin Override**: If you need to bypass restrictions, enable Admin Mode
6. **Check feedback messages**: Look for toast notifications that explain what happened

---

## Monthly Workflow

### Week 1: Preparation
1. **Load student data** from CSV or add manually
2. **Set up the month** (year, month selection)
3. **Configure operational hours** and holidays
4. **Add assessment periods** and test shifts
5. **Set monthly targets** for all students
6. **Choose view mode** (single month or 3-month view for planning)

### Week 2: Scheduling
1. **Run the scheduler** to generate initial assignments
2. **Review the results** and fill empty shifts
3. **Rebalance** to improve fairness
4. **Make manual adjustments** as needed
5. **Validate** the final schedule

### Week 3: Finalization
1. **Export CSV** for records
2. **Export ICS files** for students
3. **Print the schedule** for posting
4. **Create visual timetable** using Python script
5. **Save the final state** for backup
6. **Use Admin Override** if needed for final adjustments

### Week 4: Monitoring
1. **Handle swap requests** as they come in
2. **Update swap debts** when students work off obligations
3. **Make minor adjustments** for last-minute changes
4. **Prepare for next month** by reviewing what worked well

---

## Tips for Success

### Best Practices
1. **Start early**: Begin scheduling at least 2 weeks before the month starts
2. **Communicate clearly**: Let students know their schedules well in advance
3. **Be flexible**: Allow swaps when possible to accommodate student needs
4. **Keep records**: Export and save your schedules for future reference
5. **Validate regularly**: Use the validation tool to catch issues early

### Time-Saving Tips
1. **Use sample data** to practice before working with real data
2. **Save states frequently** to avoid losing work
3. **Use keyboard shortcuts**: 
   - `Ctrl+L` for load sample
   - `Ctrl+R` for run scheduler  
   - `Ctrl+T` for toggle 3-month view
   - `Ctrl+P` for print
   - `Ctrl+S` for save state
   - `Ctrl+O` for load state
4. **Batch similar tasks**: Set up all test shifts at once
5. **Use the 3-month view** to see patterns across months and plan ahead
6. **Leverage weekly consistency**: The scheduler automatically maintains predictable patterns
7. **Use Admin Override sparingly**: Only when you need to bypass restrictions for legitimate reasons
8. **Watch for feedback messages**: Toast notifications provide immediate feedback on your actions

### Common Mistakes to Avoid
1. **Don't forget holidays**: Always check for public holidays and school breaks
2. **Don't ignore test conflicts**: Students can't work before their tests
3. **Don't exceed hour limits**: Respect weekly and monthly maximums
4. **Don't skip validation**: Always check your schedule before finalizing
5. **Don't lose your work**: Save states regularly and export backups
6. **Don't overuse Admin Override**: Use it only when necessary, as it bypasses important safety checks
7. **Don't ignore feedback messages**: Toast notifications provide important information about your actions

---

## Keyboard Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+L` | Load Sample | Loads test data for practice |
| `Ctrl+R` | Run Scheduler | Generates the schedule |
| `Ctrl+T` | Toggle 3-Month View | Switches between single and 3-month view |
| `Ctrl+P` | Print | Prints the current schedule |
| `Ctrl+S` | Save State | Saves current work |
| `Ctrl+O` | Load State | Loads saved work |
| `Ctrl+E` | Export CSV | Downloads schedule as CSV |
| `Ctrl+I` | Export ICS | Downloads calendar files |
| `Ctrl+V` | Validate | Checks for issues |
| `Ctrl+B` | Rebalance | Improves fairness |
| `←/→` | Navigate Month | Changes month (no Ctrl needed) |
| `Escape` | Close Modal | Closes any open popup |

---

## Contact and Support

If you encounter issues not covered in this manual:
1. **Check the algorithm logs** for detailed error messages
2. **Try the validation tool** to identify specific problems
3. **Save your current state** before making changes
4. **Use Admin Override Mode** if you need to bypass restrictions
5. **Check feedback messages** for immediate guidance
6. **Document the issue** with specific steps to reproduce it

Remember: The scheduler is designed to be user-friendly, but scheduling is complex. Take your time, use the tools provided, and don't hesitate to experiment with the sample data first. The enhanced features like Admin Override Mode and Save/Load functionality make the system more flexible and robust.

---

*This manual covers the Student Shift Scheduler Enhanced version. For updates or additional features, refer to the latest documentation.*
