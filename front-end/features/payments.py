import streamlit as st

def payment_form():
    st.markdown("#### 💳 Select Payment Method")

    payment_mode = "new" # Default

    # Α. Αν υπάρχει αποθηκευμένη κάρτα, δώσε επιλογή
    if st.session_state['saved_card']:
        card_info = st.session_state['saved_card']
        # maybe keeping saved cards in backend and asking for them ?
        last_4 = card_info['number'][-4:]
        
        choice = st.radio(
            "Choose method:",
            [f"Saved Card (•••• {last_4})", "Use a New Card"],
            label_visibility="collapsed"
        )
        
        if "Saved Card" in choice:
            payment_mode = "saved"
        else:
            payment_mode = "new"

    # Β. Εμφάνιση φόρμας ανάλογα με την επιλογή
    if payment_mode == "saved":
        st.info("Using your saved payment method.")
        if st.button("Pay & Start Charging", use_container_width=True):
            st.session_state['charging_state'] = 'charging'
            st.rerun()

    else:
        # Φόρμα για νέα κάρτα
        with st.form("pay_form"):
            new_number = st.text_input("Card Number", placeholder="0000 0000 0000 0000")
            c1, c2 = st.columns(2)
            with c1: new_exp = st.text_input("Expiry", placeholder="MM/YY")
            with c2: new_cvv = st.text_input("CVV", type="password", placeholder="123")
            
            # Checkbox για αποθήκευση
            save_check = st.checkbox("Save card for future use")
            
            pay_btn = st.form_submit_button("Pay & Start Charging", use_container_width=True)
            
            if pay_btn:
                if new_number and new_exp and new_cvv:
                    if save_check:
                        # Αποθήκευση στο Session State
                        st.session_state['saved_card'] = {
                            'number': new_number,
                            'exp': new_exp,
                            'cvv': new_cvv
                        }
                        st.toast("Card saved!", icon="💾")
                        # maybe send new card to backend ?
                    
                    st.session_state['charging_state'] = 'charging'
                    st.rerun()
                else:
                    st.error("Please fill in all details.")

    # Κουμπί ακύρωσης (επιστροφή στο idle)
    if st.button("Cancel", use_container_width=True):
        st.session_state['charging_state'] = 'idle'
        st.rerun()