# Student Shift Scheduler PWA

A world-class Progressive Web Application for managing student assistant schedules with advanced features including shift swapping, analytics, and offline support.

## 🚀 Features

### Core Functionality
- **Dashboard** - Today's shifts, pending swaps, quick stats
- **Schedule Management** - Calendar grid with drag-and-drop functionality
- **Shift Swapping** - Request/approve swaps with marketplace
- **Student Management** - CSV import, availability editing, performance tracking
- **Analytics** - Reports, charts, insights, and performance metrics

### PWA Features
- **Offline Support** - Works without internet connection
- **Installable** - Add to home screen on mobile devices
- **Push Notifications** - Real-time updates for swaps and schedule changes
- **Background Sync** - Syncs data when connection is restored
- **Responsive Design** - Works on desktop, tablet, and mobile

### Advanced Features
- **3-Month Scheduling** - Plan ahead with multi-month views
- **Weekly Consistency** - Maintains student shift patterns
- **Smart Rebalancing** - Equalizes hours while respecting constraints
- **Constraint Enforcement** - Weekly/monthly caps, consecutive hour limits
- **Real-time Validation** - Live feedback on schedule conflicts

## 📱 Installation

### Option 1: Direct Installation
1. Open the PWA in your browser
2. Click the "Install" button in the address bar
3. Follow the prompts to add to your home screen

### Option 2: Manual Installation
1. Download all files to a local directory
2. Open `index.html` in a modern web browser
3. The PWA will automatically register and be ready to use

## 🛠️ Development Setup

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Local web server (optional, for development)

### Local Development
```bash
# Clone or download the project
cd "Student Scheduler PWA"

# Serve with a local server (optional)
python -m http.server 8000
# or
npx serve .

# Open in browser
open http://localhost:8000
```

### File Structure
```
Student Scheduler PWA/
├── index.html              # Main application entry point
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── README.md               # This file
├── src/
│   ├── js/
│   │   ├── app.js          # Main application logic
│   │   ├── utils/          # Utility classes
│   │   │   ├── storage.js  # Storage management
│   │   │   ├── api.js      # API client
│   │   │   └── notifications.js # Notification system
│   │   └── views/          # View modules
│   │       ├── dashboard.js
│   │       ├── schedule.js
│   │       ├── swaps.js
│   │       ├── students.js
│   │       └── analytics.js
│   └── styles/
│       ├── main.css        # Main styles
│       └── components.css  # Component styles
└── assets/
    ├── icons/              # PWA icons
    └── screenshots/        # App store screenshots
```

## 🎯 Usage

### Getting Started
1. **Load Sample Data** - Click "Load Sample" to get started quickly
2. **Import Students** - Use CSV import or add students manually
3. **Set Schedule** - Configure operational hours and shift templates
4. **Generate Schedule** - Run the automatic scheduler
5. **Manage Swaps** - Handle shift swap requests and approvals

### Key Workflows

#### Creating a Schedule
1. Navigate to **Schedule** view
2. Set month/year and operational hours
3. Add shift templates (default: 1-hour slots 06:30-18:30)
4. Click **Generate Schedule** to auto-assign shifts
5. Use **Rebalance** to equalize hours across students

#### Managing Swaps
1. Navigate to **Swaps** view
2. Students can request swaps by clicking **Request Swap**
3. Managers can approve/reject requests
4. Other students can make offers on open requests
5. System tracks swap success rates and patterns

#### Student Management
1. Navigate to **Students** view
2. Import students via CSV or add manually
3. Set availability patterns and hour limits
4. View performance metrics and shift history
5. Export student data for external use

## 🔧 Configuration

### Environment Variables
```javascript
// In src/js/utils/api.js
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.shiftscheduler.com';
```

### PWA Settings
```json
// In manifest.json
{
  "name": "Student Shift Scheduler",
  "short_name": "ShiftScheduler",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#1f2937",
  "background_color": "#111827"
}
```

## 📊 Data Management

### Storage
- **IndexedDB** - Local data storage for offline use
- **Local Storage** - User preferences and settings
- **Service Worker Cache** - Static assets and API responses

### Data Export/Import
- **CSV Export** - Schedule and student data
- **ICS Files** - Calendar integration
- **JSON State** - Complete application state backup

## 🔒 Security

### Data Protection
- All data stored locally (no external servers required)
- HTTPS required for PWA features
- No sensitive data transmitted without encryption

### Privacy
- No tracking or analytics by default
- User data remains on device
- Optional cloud sync with user consent

## 🚀 Deployment

### Web Hosting
1. Upload all files to your web server
2. Ensure HTTPS is enabled
3. Configure proper MIME types for PWA files
4. Test installation on various devices

### CDN Deployment
- Upload to CDN for global distribution
- Configure cache headers for optimal performance
- Monitor PWA installation rates

## 🐛 Troubleshooting

### Common Issues

#### PWA Not Installing
- Ensure HTTPS is enabled
- Check manifest.json is accessible
- Verify service worker registration

#### Offline Mode Not Working
- Check service worker is active
- Verify cache strategies are working
- Test with browser dev tools

#### Data Not Syncing
- Check network connectivity
- Verify API endpoints are accessible
- Review service worker logs

### Debug Mode
```javascript
// Enable debug logging
localStorage.setItem('debug', 'true');
```

## 📱 Browser Support

### Fully Supported
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### Partially Supported
- Chrome Mobile 80+
- Safari Mobile 13+
- Samsung Internet 12+

## 🤝 Contributing

### Development Guidelines
1. Follow existing code structure
2. Add comments for complex logic
3. Test on multiple devices/browsers
4. Update documentation for new features

### Code Style
- Use ES6+ features
- Follow consistent naming conventions
- Include error handling
- Add user feedback for actions

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Documentation
- Check this README for common questions
- Review inline code comments
- Examine the original Scheduler_Enhanced.html for reference

### Issues
- Report bugs via GitHub issues
- Include browser version and device type
- Provide steps to reproduce problems

## 🔄 Updates

### Version History
- **v2.0** - PWA conversion with advanced features
- **v1.0** - Original single-page application

### Future Roadmap
- [ ] Multi-language support
- [ ] Advanced reporting
- [ ] Integration with external calendars
- [ ] Mobile app versions
- [ ] Team collaboration features

---

**Built with ❤️ for efficient student schedule management**
