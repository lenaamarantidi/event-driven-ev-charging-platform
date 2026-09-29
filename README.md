# Event-Driven EV Charging Platform

This repository contains a distributed EV charging platform developed as a team project for the Software as a Service course at the School of Electrical and Computer Engineering, National Technical University of Athens (NTUA). It combines a microservices-based backend, event-driven messaging, provider integrations, and user/operator dashboards for charging-point discovery, reservation, billing, and analytics.

## Overview

The platform addresses a common challenge in modern EV infrastructure: charging stations are exposed through separate provider APIs with different contracts, data models, and operational flows. This implementation unifies those providers behind a common platform layer, allowing the system to aggregate station data, normalize provider-specific responses, manage reservations, and coordinate downstream business processes.

From the repository implementation, the platform provides:

- a unified API layer for EV charging data and operations
- provider-aware charging-point aggregation and normalization
- reservation handling across multiple charging providers
- billing and payment workflows for charging operations
- authentication, user profiles, and service-level authorization
- analytics and reporting on usage patterns
- map and dashboard-based front-end experiences for users and operators

## Architecture

The implemented architecture is a Docker-based microservices system centered on an API Gateway and a RabbitMQ message layer.

At the application level:

- The API Gateway is implemented in Python with FastAPI and exposes a consolidated HTTP entry point for the platform.
- Core business services are implemented in Node.js with Express and run as separate services with their own databases.
- The system uses RabbitMQ for asynchronous event exchange, while a dedicated Node-based message broker service wraps and validates business events.
- Each provider integration is isolated as its own adapter service (red, green, and blue plug) with a dedicated MariaDB-backed normalized data store.
- The central Points Service aggregates and normalizes charging-point data from the provider adapters.
- Docker Compose coordinates the services, network, and persistent volumes for the platform.

The repository also includes a Vite-based frontend app under the front-end directory and a server-rendered dashboard service under Frontend_Service for user/operator interfaces.

## Core Services

The following services are clearly implemented in the repository and are part of the active architecture:

- API Gateway: single HTTP entry point for routing service requests through /api paths.
- Auth Service: registration, login, JWT-based authentication, profile management, and health checks.
- Provider Management Service: provider metadata and provider-level operations.
- Points Service: central charging-point data repository with provider normalization and synchronization logic.
- Reservation Service: unified reservation flows, provider-specific reservation mapping, and reservation history storage.
- Billing Service: invoice generation, billing records, and provider billing summaries.
- Payment Service: payment transaction and settlement tracking.
- Analytics Service: event-driven analytics and reporting on platform usage.
- Map UI Service: map and location-oriented service support.
- Message Broker: RabbitMQ-backed event bus wrapper that validates canonical business events.
- Provider Adapter services: Red Plug, Green Plug, and Blue Plug adapters for provider-specific data access and synchronization.

## Key Features

- Multi-provider EV charging aggregation across Red Plug, Green Plug, and Blue Plug sources.
- Normalized point model with consistent status, location, pricing, and connector metadata.
- Reservation orchestration with provider-specific request adaptation and reservation history.
- Billing and invoice flows based on billable events and provider usage.
- Authentication and profile management with JWT and refresh-token support.
- Event-driven communication between services through RabbitMQ and the message-broker layer.
- Docker-supported deployment of the platform and its dependent databases.
- Map and dashboard interfaces for EV users and operator workflows.

## Technology Stack

### Backend
- Python + FastAPI for the API Gateway
- Node.js + Express for the microservices
- MariaDB/MySQL for per-service persistence

### Frontend
- React + Vite in the front-end application
- Leaflet and related map libraries for location visualization
- HTML/dashboard pages in Frontend_Service for operator and user views

### Messaging and integration
- RabbitMQ for asynchronous messaging
- amqplib for service-to-broker communication
- Provider adapter services for external charging-provider APIs

### Infrastructure
- Docker and Docker Compose for orchestration
- Containerized databases and service networks
- Persistent volumes for message broker and database state

## Event-Driven Communication

The repository uses RabbitMQ as the main asynchronous backbone for service coordination. The root docker-compose file starts a RabbitMQ broker and a dedicated message-broker service, and the Node services connect to RabbitMQ through environment configuration such as RABBITMQ_URL.

In the implemented code, the message-broker service validates canonical business events, tracks event metadata, and supports retry and dead-letter handling patterns for critical events. Services such as Reservation, Billing, Analytics, and provider adapters publish or consume events that describe point updates, reservation creation, billing events, and payment activity. This lets the platform decouple operational workflows and keep service interactions resilient without requiring all communication to be synchronous.

## Running the Project

The repository provides Docker Compose configuration for the platform and service-specific startup scripts for selected components.

From the project root:

```bash
docker compose up --build -d
```

To stop the stack:

```bash
docker compose down
```

For the Vite frontend application:

```bash
cd front-end
npm install
npm run dev
```

The repository also includes service-specific startup scripts and Dockerfiles for the backend services and provider adapters, which are used as part of the implemented deployment layout.

> Configuration templates and environment examples are included for local setup, but the values in those files should be treated as examples rather than copied as-is into a real environment.

## Project Context

This project was developed as a team effort for the Software as a Service course at the School of Electrical and Computer Engineering, National Technical University of Athens (NTUA). It reflects a collaborative microservice design developed by the team rather than an individual-only implementation.

The repository preserves the original collaborative Git history and codebase structure, allowing the project to be reviewed and built as a genuine team engineering effort.
