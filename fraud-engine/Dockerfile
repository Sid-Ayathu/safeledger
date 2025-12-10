# Use official Python runtime
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Run the application (use -u for unbuffered output so logs show up immediately)
CMD ["python", "-u", "main.py"]