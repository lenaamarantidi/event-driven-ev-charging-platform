FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app ./app

# Create logs directory
RUN mkdir -p logs

ARG PORT=4411

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD python -c "import os, httpx; port = os.getenv('PORT', '4411'); httpx.get(f'http://localhost:{port}/health', timeout=5).raise_for_status()" || exit 1

# Run application
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
