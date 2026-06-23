const {
  __testSetChannel,
  __testResetChannel,
  handleUserRegisteredEvent,
  handleProviderRegisteredEvent,
  handleReservationCompletedEvent
} = require('./rabbitmq');

const mockQuery = jest.fn();

jest.mock('./db', () => ({
  pool: {
    query: (...args) => mockQuery(...args)
  }
}));

describe('Analytics Service RabbitMQ event handlers', () => {
  let fakeChannel;

  beforeEach(() => {
    fakeChannel = {
      ack: jest.fn(),
      nack: jest.fn()
    };
    __testSetChannel(fakeChannel);
    mockQuery.mockReset();
  });

  afterEach(() => {
    __testResetChannel();
  });

  test('user_registered event stores user registrations', async () => {
    const msg = {
      content: Buffer.from(JSON.stringify({ userId: 'user-123', timestamp: '2026-06-23T10:00:00.000Z' }))
    };

    await handleUserRegisteredEvent(msg);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO user_registrations'),
      ['user-123', new Date('2026-06-23T10:00:00.000Z')]
    );
    expect(fakeChannel.ack).toHaveBeenCalledWith(msg);
    expect(fakeChannel.nack).not.toHaveBeenCalled();
  });

  test('provider_registered event stores provider registrations', async () => {
    const msg = {
      content: Buffer.from(JSON.stringify({ providerId: 10, providerName: 'testProvider', timestamp: '2026-06-23T10:05:00.000Z' }))
    };

    await handleProviderRegisteredEvent(msg);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO provider_registrations'),
      [10, 'testProvider', new Date('2026-06-23T10:05:00.000Z')]
    );
    expect(fakeChannel.ack).toHaveBeenCalledWith(msg);
    expect(fakeChannel.nack).not.toHaveBeenCalled();
  });

  test('reservation_completed event logs reservation and updates daily stats', async () => {
    const eventPayload = {
      reservationId: 'resv-123',
      providerId: 10,
      providerName: 'testProvider',
      userId: 'user-123',
      pointId: 'point-abc',
      status: 'success',
      timestamp: '2026-06-23T10:10:00.000Z'
    };

    mockQuery.mockResolvedValueOnce([{}]);
    mockQuery.mockResolvedValueOnce([{}]);
    mockQuery.mockResolvedValueOnce([{}]);

    await handleReservationCompletedEvent({ content: Buffer.from(JSON.stringify(eventPayload)) });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO reservation_events'),
      ['resv-123', 10, 'testProvider', 'user-123', 'point-abc', 'success', new Date('2026-06-23T10:10:00.000Z')]
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO provider_daily_stats'),
      expect.arrayContaining([10, '2026-06-23', 1, 0, 10, '2026-06-23'])
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO global_daily_stats'),
      ['2026-06-23', 1, 0]
    );

    expect(fakeChannel.ack).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(Buffer) }));
    expect(fakeChannel.nack).not.toHaveBeenCalled();
  });
});