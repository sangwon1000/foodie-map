// Global variables
let restaurants = [];
let map;
let markers = {};

// Get DOM elements
const sidebar = document.getElementById('sidebar');
const restaurantList = document.getElementById('restaurant-list');
const selectedRestaurantInfo = document.getElementById('selected-restaurant');

// Get filter elements
const cityFilter = document.getElementById('country-filter');
const cuisineFilter = document.getElementById('cuisine-filter');
const priceFilter = document.getElementById('price-filter');
const searchInput = document.querySelector('.search-input');

// Add event listeners for filters
cityFilter.addEventListener('change', filterRestaurants);
cuisineFilter.addEventListener('change', filterRestaurants);
priceFilter.addEventListener('change', filterRestaurants);
searchInput.addEventListener('input', filterRestaurants);

// Fetch restaurants data
async function fetchRestaurants() {
    try {
        const response = await fetch('http://127.0.0.1:8000/api/hong-kong-restaurants');
        restaurants = await response.json();
        populateCuisineFilter();
        renderRestaurants(restaurants);
    } catch (error) {
        console.error('Error fetching restaurants:', error);
    }
}

// Populate cuisine filter options
function populateCuisineFilter() {
    const cuisines = [...new Set(restaurants.map(restaurant => restaurant.Cuisine))];
    cuisineFilter.innerHTML = '<option value="all">All</option>';
    cuisines.forEach(cuisine => {
        const option = document.createElement('option');
        option.value = cuisine;
        option.textContent = cuisine;
        cuisineFilter.appendChild(option);
    });
}

// Filter restaurants
function filterRestaurants() {
    const selectedCity = cityFilter.value;
    const selectedCuisine = cuisineFilter.value;
    const selectedPrice = priceFilter.value;
    const searchQuery = searchInput.value.toLowerCase();

    const filteredRestaurants = restaurants.filter(restaurant => {
        const matchesCity = restaurant.Address.includes(selectedCity);
        const matchesCuisine = selectedCuisine === 'all' || restaurant.Cuisine === selectedCuisine;
        const matchesPrice = selectedPrice === 'all' || restaurant.Price === selectedPrice;
        const matchesSearch = restaurant.Title.toLowerCase().includes(searchQuery) ||
            restaurant.Cuisine.toLowerCase().includes(searchQuery);

        return matchesCity && matchesCuisine && matchesPrice && matchesSearch;
    });

    renderRestaurants(filteredRestaurants);
}

// Initialize map and restaurants on page load
window.addEventListener('load', async () => {
    try {
        // Fetch MapTiler API key from backend
        const response = await fetch('http://127.0.0.1:8000/api/maptiler-key');
        const data = await response.json();
        maptilersdk.config.apiKey = data.apiKey;

        // Initialize map
        map = new maptilersdk.Map({
            container: 'map',
            style: maptilersdk.MapStyle.WINTER,
            center: [114.1694, 22.3193], // Hong Kong coordinates
            zoom: 11
        });

        // Fetch and render restaurants
        await fetchRestaurants();
    } catch (error) {
        console.error('Error initializing map:', error);
    }
});

// Function to render restaurants
function renderRestaurants(restaurantsToRender) {
    restaurantList.innerHTML = '';
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};

    restaurantsToRender.forEach(restaurant => {
        // Create restaurant card
        const card = document.createElement('div');
        card.className = 'restaurant-card';
        card.innerHTML = `
            <div class="restaurant-name">${restaurant.Title}</div>
            <div class="restaurant-info">${restaurant.Cuisine} • ${restaurant.Price}</div>
            <div class="rating">${restaurant.Badge_Text || ''}</div>
        `;
        card.addEventListener('click', () => selectRestaurant(restaurant));
        restaurantList.appendChild(card);

        // Add marker to the map only if coordinates are available
        if (restaurant.Google_Lng && restaurant.Google_Lat) {
            const marker = new maptilersdk.Marker()
                .setLngLat([restaurant.Google_Lng, restaurant.Google_Lat])
                .addTo(map);

            marker.getElement().addEventListener('click', () => selectRestaurant(restaurant));

            markers[restaurant.Title] = marker;
        }
    });
}

// Function to handle restaurant selection
function selectRestaurant(restaurant) {
    if (restaurant.Google_Lng && restaurant.Google_Lat) {
        map.flyTo({
            center: [restaurant.Google_Lng, restaurant.Google_Lat],
            zoom: 15
        });
    }

    selectedRestaurantInfo.style.display = 'block';
    selectedRestaurantInfo.innerHTML = `
        <div class="close-button">&times;</div>
        <div class="restaurant-name">${restaurant.Title}</div>
        <div class="restaurant-info">${restaurant.Cuisine} • ${restaurant.Price}</div>
        <div class="rating">${restaurant.Badge_Text || ''}</div>
        <p>${restaurant.Description}</p>
        <button class="book-button" onclick="window.open('${restaurant.Website || '#'}', '_blank')">Visit Website</button>
        <button class="map-button" onclick="window.open('${restaurant.Share_URL || '#'}', '_blank')">View on Google Maps</button>
    `;

    // Add event listener for the close button
    const closeButton = selectedRestaurantInfo.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        selectedRestaurantInfo.style.display = 'none';
    });

    // Highlight the selected restaurant in the sidebar
    const restaurantCards = document.querySelectorAll('.restaurant-card');
    restaurantCards.forEach(card => {
        if (card.querySelector('.restaurant-name').textContent === restaurant.Title) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}
