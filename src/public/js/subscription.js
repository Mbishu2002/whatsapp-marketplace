/**
 * Subscription and Boosting Management UI
 * 
 * This script handles the UI interactions for subscription and boosting features.
 */

// Initialize the subscription page
async function initSubscriptionPage() {
  // Load subscription plans
  await loadSubscriptionPlans();
  
  // Load user's active subscription
  await loadUserSubscription();
  
  // Set up event listeners
  setupEventListeners();
}

// Load subscription plans from the API
async function loadSubscriptionPlans() {
  try {
    const response = await fetch('/api/payment/subscription/plans');
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load subscription plans');
    }
    
    displaySubscriptionPlans(data.data);
  } catch (error) {
    console.error('Error loading subscription plans:', error);
    showError('Failed to load subscription plans. Please try again later.');
  }
}

// Display subscription plans in the UI
function displaySubscriptionPlans(plans) {
  const plansContainer = document.getElementById('subscription-plans');
  
  if (!plansContainer) {
    console.error('Subscription plans container not found');
    return;
  }
  
  // Clear existing content
  plansContainer.innerHTML = '';
  
  if (!plans || !plans.length) {
    plansContainer.innerHTML = '<p class="text-center">No subscription plans available at this time.</p>';
    return;
  }
  
  // Create a card for each plan
  plans.forEach(plan => {
    const planCard = document.createElement('div');
    planCard.className = 'col-md-4 mb-4';
    
    // Parse features from JSON
    const features = plan.features ? Object.entries(plan.features)
      .map(([key, value]) => `<li>${key.replace(/_/g, ' ')}: ${value}</li>`)
      .join('') : '';
    
    planCard.innerHTML = `
      <div class="card h-100">
        <div class="card-header bg-primary text-white">
          <h5 class="card-title mb-0">${plan.name}</h5>
        </div>
        <div class="card-body">
          <h6 class="card-subtitle mb-2 text-muted">${plan.price} ${plan.currency}</h6>
          <p class="card-text">Duration: ${plan.duration_days} days</p>
          <ul class="features-list">
            ${features}
          </ul>
        </div>
        <div class="card-footer">
          <button class="btn btn-primary btn-subscribe" data-plan-id="${plan.id}">Subscribe</button>
        </div>
      </div>
    `;
    
    plansContainer.appendChild(planCard);
  });
  
  // Add event listeners to subscribe buttons
  document.querySelectorAll('.btn-subscribe').forEach(button => {
    button.addEventListener('click', async (event) => {
      const planId = event.target.getAttribute('data-plan-id');
      await subscribeToPlane(planId);
    });
  });
}

// Subscribe to a plan
async function subscribeToPlane(planId) {
  try {
    // Get user phone from session or prompt
    const userPhone = getUserPhone();
    
    if (!userPhone) {
      showError('Please enter your phone number to subscribe.');
      return;
    }
    
    // Show loading state
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';
    
    // Create subscription payment
    const response = await fetch('/api/payment/subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userPhone,
        planId
      })
    });
    
    const data = await response.json();
    
    // Hide loading state
    if (loadingEl) loadingEl.style.display = 'none';
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to create subscription');
    }
    
    // Redirect to payment URL
    window.location.href = data.data.paymentUrl;
  } catch (error) {
    console.error('Error subscribing to plan:', error);
    showError('Failed to process subscription. Please try again later.');
  }
}

// Load user's active subscription
async function loadUserSubscription() {
  try {
    // Get user phone from session or prompt
    const userPhone = getUserPhone();
    
    if (!userPhone) {
      // Don't show error, just don't load subscription
      return;
    }
    
    const response = await fetch(`/api/payment/subscription/check/${encodeURIComponent(userPhone)}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load subscription');
    }
    
    displayUserSubscription(data.data);
  } catch (error) {
    console.error('Error loading user subscription:', error);
    // Don't show error to user, just log it
  }
}

// Display user's active subscription
function displayUserSubscription(subscription) {
  const subscriptionContainer = document.getElementById('active-subscription');
  
  if (!subscriptionContainer) {
    console.error('Subscription container not found');
    return;
  }
  
  // Clear existing content
  subscriptionContainer.innerHTML = '';
  
  if (!subscription) {
    subscriptionContainer.innerHTML = '<p class="alert alert-info">You do not have an active subscription.</p>';
    return;
  }
  
  // Calculate days remaining
  const endDate = new Date(subscription.end_date);
  const daysRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
  
  subscriptionContainer.innerHTML = `
    <div class="card">
      <div class="card-header bg-success text-white">
        <h5 class="card-title mb-0">Active Subscription</h5>
      </div>
      <div class="card-body">
        <h6 class="card-subtitle mb-2">${subscription.subscription_plans.name}</h6>
        <p>Status: <span class="badge bg-success">Active</span></p>
        <p>Expires: ${endDate.toLocaleDateString()}</p>
        <p>Days remaining: ${daysRemaining}</p>
      </div>
    </div>
  `;
}

// Get user phone from session or prompt
function getUserPhone() {
  // This is a placeholder - in a real app, you'd get this from the session
  // For now, we'll use localStorage or prompt the user
  let userPhone = localStorage.getItem('userPhone');
  
  if (!userPhone) {
    userPhone = prompt('Please enter your WhatsApp phone number (with country code):');
    
    if (userPhone) {
      localStorage.setItem('userPhone', userPhone);
    }
  }
  
  return userPhone;
}

// Set up event listeners
function setupEventListeners() {
  // Refresh button
  const refreshBtn = document.getElementById('refresh-subscription');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await loadUserSubscription();
    });
  }
  
  // Clear phone button
  const clearPhoneBtn = document.getElementById('clear-phone');
  if (clearPhoneBtn) {
    clearPhoneBtn.addEventListener('click', () => {
      localStorage.removeItem('userPhone');
      alert('Phone number cleared. Please refresh the page to enter a new number.');
      location.reload();
    });
  }
}

// Show error message
function showError(message) {
  const errorContainer = document.getElementById('error-container');
  
  if (!errorContainer) {
    alert(message);
    return;
  }
  
  errorContainer.innerHTML = `
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', initSubscriptionPage);
