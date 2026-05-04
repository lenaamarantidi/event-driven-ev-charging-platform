import streamlit as st
import time
from datetime import datetime, timedelta
from utils.api import reserve_point, save_session

def display_charging_options(charger):
    """Εμφανίζει τα κουμπιά 'Charge Now' και 'Reserve'."""
    
    # Κουμπί: Charge Now
    if st.button("⚡ Charge now", use_container_width=True):
        if charger['status'] == 'available':
            # must check upcoming reservations
            st.session_state['charging_state'] = 'payment'
            st.rerun()
        else:
            st.toast("Charger is not available!", icon="🚫")

    # Κουμπί: Reserve
    if st.button("📅 Reserve (30')", use_container_width=True):
        if charger['status'] == 'available':
            # Καλούμε το API μέσω του utils
            res, err = reserve_point(charger['pointid'], 30)
            
            if res and res.status_code == 200:
                st.success("Reserved successfully!")
                time.sleep(1)
                st.rerun()
            else:
                msg = f"Failed: {res.status_code}" if res else f"Server connection error: {err}. Please try again later."
                st.error(msg)
        else:
            st.warning("Not available!")

def simulate_charging(charger):
    # must add "stop charging" button
    # must stop charging if current_cost > money that user paid
    st.markdown("#### 🔌 Charging...")
    
    prog_bar = st.progress(0)
    col_m1, col_m2, col_m3 = st.columns(3)
    kwh_metric = col_m1.empty()
    cost_metric = col_m2.empty()
    time_metric = col_m3.empty()

    price = float(charger.get('kwhprice', 0.30))
    
    # Προσομοίωση (τρέχει μόνο αν δεν έχει ολοκληρωθεί ήδη στο session)
    if st.session_state['session_metrics']['kwh'] == 0:
        for i in range(1, 101):
            time.sleep(0.03) # Ταχύτητα animation
            current_kwh = i * 0.15 
            current_cost = current_kwh * price
            
            prog_bar.progress(i)
            kwh_metric.metric("kWh", f"{current_kwh:.1f}")
            cost_metric.metric("€", f"{current_cost:.2f}")
            time_metric.metric("Min", f"{i//2}")
        
        # Αποθήκευση τελικών μετρήσεων στο state
        st.session_state['session_metrics'] = {
            'kwh': 15.0,
            'cost': 15.0 * price,
            'duration': 50
        }
        st.session_state['charging_state'] = 'summary'
        st.rerun()

def display_summary(charger):
    st.success("Charging Complete!")
    st.markdown("### 🧾 Receipt")
    
    metrics = st.session_state['session_metrics']
    st.info(f"**Total Energy:** {metrics['kwh']} kWh\n\n**Total Cost:** {metrics['cost']:.2f} €")
    
    if st.button("Finish & Save History", use_container_width=True):
        # Προετοιμασία δεδομένων για το Backend
        now = datetime.now()
        start_time = (now - timedelta(minutes=metrics['duration'])).strftime("%Y-%m-%d %H:%M")
        end_time = now.strftime("%Y-%m-%d %H:%M")

        payload = {
            "id": charger['pointid'],
            "starttime": start_time,
            "endtime": end_time,
            "startsoc": 20,
            "endsoc": 90,
            "totalkwh": metrics['kwh'],
            "kwhprice": float(charger.get('kwhprice', 0)),
            "amount": metrics['cost']
        }

        # Κλήση API αποθήκευσης
        res, err = save_session(payload)

        if res and res.status_code == 200:
            st.toast("Saved to history!", icon="✅")
        elif err:
            st.error(f"Connection error: {err}")
        else:
            st.error(f"Error saving: {res.text}")
        
        # Reset και επιστροφή
        st.session_state['charging_state'] = 'idle'
        st.session_state['session_metrics'] = {'kwh': 0, 'cost': 0, 'duration': 0}
        time.sleep(1)
        st.rerun()