import { useState, useEffect } from "react";
import axios from 'axios';
import { BASE_URL } from '../config';

const Account = ({ savedCard, setSavedCard }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cancelingId, setCancelingId] = useState(null);
    const username = localStorage.getItem('username');

    // Fetch user's reservations
    useEffect(() => {
        const fetchReservations = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`${BASE_URL}/ui/reservations`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                setReservations(response.data);
            } catch (error) {
                console.error('Error fetching reservations:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReservations();
    }, []);

    const handleCancelReservation = async (reservationId) => {
        if (!window.confirm('Are you sure you want to cancel this reservation?')) {
            return;
        }

        setCancelingId(reservationId);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${BASE_URL}/ui/reservations/${reservationId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            
            // Remove from list
            setReservations(prev => prev.filter(r => r.reservation_id !== reservationId));
            alert('Reservation cancelled successfully!');
        } catch (error) {
            const message = error?.response?.data?.error || 'Error cancelling reservation';
            alert(message);
        } finally {
            setCancelingId(null);
        }
    };

    return (
        <div className="container-fluid mt-4" style={{ color: '#f5f1ff', backgroundColor: '#1a1428', minHeight: '100vh', padding: '2rem 1rem' }}>
            <h2 style={{ color: '#f5f1ff' }}>👤 My Account</h2>
            {username ? (
                <div className="alert alert-info" style={{ backgroundColor: '#2d1f47', color: '#f5f1ff', borderColor: '#5d4a80' }}>Logged in as: {username}</div>
            ) : (
                <div className="alert alert-info" style={{ backgroundColor: '#2d1f47', color: '#f5f1ff', borderColor: '#5d4a80' }}>Logged in (Token active)</div>
            )}
            <hr style={{ borderColor: '#5d4a80' }} />
            <h4 style={{ color: '#f5f1ff' }}>💳 Saved Payment Methods</h4>
            
            {savedCard ? (
                <div className="card p-3 mt-3" style={{maxWidth: '400px', backgroundColor: '#2d1f47', borderColor: '#5d4a80', color: '#f5f1ff'}}>
                    <h5 style={{ color: '#ffd700' }}>Card ending in •••• {savedCard.number.slice(-4)}</h5>
                    <p className="mb-1">Expires: {savedCard.exp}</p>
                    
                    {!confirmDelete ? (
                        <button className="btn btn-outline-danger mt-2" onClick={() => setConfirmDelete(true)}>
                            🗑️ Remove Card
                        </button>
                    ) : (
                        <div className="mt-2 border p-2 rounded border-danger">
                            <p className="text-danger mb-2">⚠️ Are you sure?</p>
                            <div className="d-flex gap-2">
                                <button className="btn btn-danger btn-sm" onClick={() => { setSavedCard(null); setConfirmDelete(false); }}>Yes, Remove</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="alert alert-warning mt-3" style={{ backgroundColor: '#2d1f47', color: '#f5f1ff', borderColor: '#5d4a80' }}>No saved cards found.</div>
            )}
            
            <hr className="my-4" style={{ borderColor: '#5d4a80' }} />
            
            {/* My Reservations Section */}
            <h4 style={{ color: '#f5f1ff' }}>📅 My Reservations</h4>
            
            {loading ? (
                <div className="alert alert-info mt-3" style={{ backgroundColor: '#2d1f47', color: '#f5f1ff', borderColor: '#5d4a80' }}>Loading reservations...</div>
            ) : reservations.length === 0 ? (
                <div className="alert alert-warning mt-3" style={{ backgroundColor: '#2d1f47', color: '#f5f1ff', borderColor: '#5d4a80' }}>No reservations found.</div>
            ) : reservations.filter(r => r.status === 'scheduled' || r.status === 'active').length === 0 ? (
                <div className="alert alert-info" style={{ backgroundColor: '#2d1f47', color: '#f5f1ff', borderColor: '#5d4a80' }}>
                    You have no upcoming reservations. All reservations are completed or cancelled.
                </div>
            ) : (
                <div className="mt-3">
                    {reservations
                        .filter(r => r.status === 'scheduled' || r.status === 'active')
                        .map((reservation) => {
                            const isScheduled = reservation.status === 'scheduled';
                            const isActive = reservation.status === 'active';
                            
                            return (
                                <div 
                                    key={reservation.reservation_id} 
                                    className={`card mb-3 ${isActive ? 'border-success' : 'border-primary'}`}
                                    style={{ maxWidth: '700px', boxShadow: isActive ? '0 0 10px rgba(25, 135, 84, 0.3)' : '0 0 5px rgba(13, 110, 253, 0.2)' }}
                                >
                                    <div className="card-body">
                                        <div className="d-flex justify-content-between align-items-start mb-3">
                                            <div className="flex-grow-1">
                                                <h5 className="card-title mb-1">
                                                    <span className="me-2">📍</span>
                                                    {reservation.location_name}
                                                </h5>
                                                <p className="card-text text-muted small mb-0">{reservation.address}</p>
                                            </div>
                                            <div>
                                                {isScheduled && (
                                                    <span className="badge bg-primary" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
                                                        Scheduled
                                                    </span>
                                                )}
                                                {isActive && (
                                                    <span className="badge bg-success" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
                                                        ● Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="bg-light rounded p-3 mb-3">
                                            <div className="row g-3">
                                                <div className="col-md-6">
                                                    <div className="d-flex align-items-center">
                                                        <span className="text-primary me-2" style={{fontSize: '1.2rem'}}>📅</span>
                                                        <div>
                                                            <small className="text-muted d-block">Date</small>
                                                            <strong>{reservation.date}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-md-6">
                                                    <div className="d-flex align-items-center">
                                                        <span className="text-primary me-2" style={{fontSize: '1.2rem'}}>⏰</span>
                                                        <div>
                                                            <small className="text-muted d-block">Time Window</small>
                                                            <strong>{reservation.start_time} - {reservation.end_time}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-md-6">
                                                    <div className="d-flex align-items-center">
                                                        <span className="text-primary me-2" style={{fontSize: '1.2rem'}}>🔌</span>
                                                        <div>
                                                            <small className="text-muted d-block">Connector Type</small>
                                                            <strong>{reservation.connector_type || 'Standard'}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-md-6">
                                                    <div className="d-flex align-items-center">
                                                        <span className="text-primary me-2" style={{fontSize: '1.2rem'}}>⚡</span>
                                                        <div>
                                                            <small className="text-muted d-block">Charging Power</small>
                                                            <strong>{reservation.kilowatts || 0} kW</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-md-6">
                                                    <div className="d-flex align-items-center">
                                                        <span className="text-primary me-2" style={{fontSize: '1.2rem'}}>💰</span>
                                                        <div>
                                                            <small className="text-muted d-block">Price per kWh</small>
                                                            <strong>€{reservation.price_per_kwh?.toFixed(2) || '0.00'}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-md-6">
                                                    <div className="d-flex align-items-center">
                                                        <span className="text-muted me-2" style={{fontSize: '1.2rem'}}>🆔</span>
                                                        <div>
                                                            <small className="text-muted d-block">Reservation ID</small>
                                                            <strong className="text-muted">#{reservation.reservation_id}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="d-flex justify-content-between align-items-center">
                                            <div>
                                                {isActive && (
                                                    <small className="text-success">
                                                        <strong>✓ Reservation is currently active</strong>
                                                    </small>
                                                )}
                                                {isScheduled && (
                                                    <small className="text-muted">
                                                        Waiting for start time to activate
                                                    </small>
                                                )}
                                            </div>
                                            {isScheduled && (
                                                <button 
                                                    className="btn btn-outline-danger btn-sm"
                                                    onClick={() => handleCancelReservation(reservation.reservation_id)}
                                                    disabled={cancelingId === reservation.reservation_id}
                                                >
                                                    {cancelingId === reservation.reservation_id ? 'Cancelling...' : '❌ Cancel'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                            );
                        })}
                </div>
            )}
        </div>
    );
};

export default Account;