// Sample restaurant data
const restaurants = [
    { id: 1, name: "Samgyetang House", cuisine: "Korean", price: "$$", rating: 4.7, lat: 37.5665, lng: 126.9780 },
    { id: 2, name: "Sushi Sejong", cuisine: "Japanese", price: "$$$", rating: 4.9, lat: 37.5725, lng: 126.9760 },
    { id: 3, name: "Nonna's Pasta", cuisine: "Italian", price: "$$", rating: 4.8, lat: 37.5635, lng: 126.9845 },
    { id: 4, name: "Gangnam Curry", cuisine: "Indian", price: "$", rating: 4.6, lat: 37.5172, lng: 127.0473 },
    { id: 5, name: "Seoul BBQ", cuisine: "Korean", price: "$$$", rating: 4.5, lat: 37.5641, lng: 126.9810 },
];

// Get DOM elements
const sidebar = document.getElementById('sidebar');
const divider = document.getElementById('divider');
const restaurantList = document.getElementById('restaurant-list');
const selectedRestaurantInfo = document.getElementById('selected-restaurant');

// Object to store map markers
const markers = {};

// Flag for divider dragging
let isDragging = false;

// Initialize map and restaurants on page load
window.addEventListener('load', async () => {
    try {
        // Fetch MapTiler API key from backend
        const response = await fetch('http://127.0.0.1:8000/api/maptiler-key');
        const data = await response.json();
        maptilersdk.config.apiKey = data.apiKey;

        // Initialize map
        const map = new maptilersdk.Map({
            container: 'map',
            style: maptilersdk.MapStyle.WINTER,
            center: [126.9780, 37.5665], // Change to Seoul's coordinates
            zoom: 12
        });

        // Render restaurants on the map and sidebar
        renderRestaurants(map);
    } catch (error) {
        console.error('Error fetching the API key:', error);
    }
});

// Function to render restaurants
function renderRestaurants(map) {
    restaurantList.innerHTML = '';
    restaurants.forEach(restaurant => {
        // Create restaurant card
        const card = document.createElement('div');
        card.className = 'restaurant-card';
        card.innerHTML = `
            <div class="restaurant-name">${restaurant.name}</div>
            <div class="restaurant-info">${restaurant.cuisine} • ${restaurant.price}</div>
            <div class="rating">★ ${restaurant.rating}</div>
        `;
        card.addEventListener('click', () => selectRestaurant(restaurant));
        restaurantList.appendChild(card);

        // Determine marker icon based on cuisine
        let iconUrl;
        switch (restaurant.cuisine) {
            case 'Korean':
                iconUrl = './beef.png'; // Replace with actual path
                break;
            case 'Japanese':
                iconUrl = './gook.png'; // Replace with actual path
                break;
            case 'Italian':
                iconUrl = './beef.png'; // Replace with actual path
                break;
            case 'Indian':
                iconUrl = 'path/to/indian-icon.png'; // Replace with actual path
                break;
            default:
                iconUrl = 'path/to/default-icon.png'; // Replace with actual path
        }

        // Add marker to the map with custom icon
        const marker = new maptilersdk.Marker({ element: createCustomMarker(iconUrl) })
            .setLngLat([restaurant.lng, restaurant.lat])
            .addTo(map);

        markers[restaurant.id] = marker;
    });
}

// Function to create a custom marker element
function createCustomMarker(iconUrl) {
    const markerElement = document.createElement('div');
    markerElement.style.backgroundImage = `url(${iconUrl})`;
    markerElement.style.width = '30px'; // Adjust size as needed
    markerElement.style.height = '30px'; // Adjust size as needed
    markerElement.style.backgroundSize = 'cover';
    return markerElement;
}

// Function to handle restaurant selection
function selectRestaurant(restaurant) {
    // Check if map is defined
    if (typeof map === 'undefined') {
        console.error('Map is not initialized');
        return;
    }

    // Center map on selected restaurant
    map.flyTo({
        center: [restaurant.lng, restaurant.lat],
        zoom: 15
    });

    // Check if selectedRestaurantInfo element exists
    const selectedRestaurantInfo = document.getElementById('selectedRestaurantInfo');
    if (!selectedRestaurantInfo) {
        console.error('Selected restaurant info element not found');
        return;
    }

    // Display selected restaurant info
    selectedRestaurantInfo.style.display = 'block';
    selectedRestaurantInfo.innerHTML = `
        <div class="restaurant-name">${restaurant.name}</div>
        <div class="restaurant-info">${restaurant.cuisine} • ${restaurant.price}</div>
        <div class="rating">★ ${restaurant.rating}</div>
        <button class="book-button">Book a Table</button>
    `;

    // Highlight the selected restaurant in the sidebar
    const restaurantCards = document.querySelectorAll('.restaurant-card');
    restaurantCards.forEach(card => {
        if (card.querySelector('.restaurant-name').textContent === restaurant.name) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

// Event listener for divider drag start
divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
});

// Event listener for divider dragging
document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const newWidth = Math.max(50, e.clientX);
    if (newWidth < window.innerWidth - 200) {
        sidebar.style.width = newWidth + 'px';
    }
});

// Event listener for divider drag end
document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = 'auto';
    document.body.style.cursor = 'default';
});

