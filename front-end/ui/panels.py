import streamlit as st

def display_charger_info(chargers_df):
    # 1. Close button
    _, cl2 = st.columns([4, 1])
    with cl2:
        if st.button("✖", key="close_panel"):
            st.session_state['selected_id'] = "None"
            st.rerun()

    # 2. Charger info (including charger_type !!)
    if not chargers_df.empty and st.session_state['selected_id'] != "None":
        selected_rows = chargers_df[chargers_df['pointid'] == st.session_state['selected_id']]
        
        if not selected_rows.empty:
            my_charger = selected_rows.iloc[0]
            
            st.markdown('<div class="info-card">', unsafe_allow_html=True)
            st.subheader(f"Station {my_charger['pointid']}")
            
            dist_display = f"{my_charger['distance']:.2f} km" if 'distance' in my_charger else "-"

            st.markdown(f"""
            <div style="font-size: 14px; line-height: 1.6;">
                <strong>Type:</strong> {my_charger.get('charger_type', 'AC')}<br>
                <strong>Cost:</strong> {my_charger.get('kwhprice', '-')} €/kWh<br>
                <strong>Status:</strong> {my_charger['status']}<br>
                <strong>Distance:</strong> {dist_display}<br>
                <br>
            </div>
            """, unsafe_allow_html=True)

            # 3. Navigation button
            if st.button("🗺️ Navigate (Google Maps)", use_container_width=True):
                if my_charger['status'] != 'available':
                    st.session_state['modal_state'] = 'warning'
                else:
                    st.session_state['modal_state'] = 'google_maps'
                st.rerun()
            
            st.markdown('</div>', unsafe_allow_html=True)
            
            return my_charger
            
    return None