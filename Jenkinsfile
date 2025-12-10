pipeline {
    agent any

    environment {
        // In a real Jenkins, these are set in "Manage Credentials"
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-login')
        KUBECONFIG = credentials('kubeconfig-file')
    }

    stages {
        stage('Checkout') {
            steps {
                // Get code from GitHub
                checkout scm
            }
        }

        stage('Build Docker Images') {
            steps {
                script {
                    echo '🔨 Building Docker Images...'
                    // Build all 4 services in parallel to save time
                    parallel(
                        'Gateway': { sh 'docker build -t yourname/api-gateway:latest ./api-gateway' },
                        'Auth': { sh 'docker build -t yourname/auth-service:latest ./auth-service' },
                        'Ledger': { sh 'docker build -t yourname/ledger-service:latest ./ledger-service' },
                        'Fraud': { sh 'docker build -t yourname/fraud-engine:latest ./fraud-engine' }
                    )
                }
            }
        }

        stage('Push to Registry') {
            steps {
                script {
                    echo '🚀 Pushing to Docker Hub...'
                    sh 'echo $DOCKERHUB_CREDENTIALS_PSW | docker login -u $DOCKERHUB_CREDENTIALS_USR --password-stdin'
                    
                    sh 'docker push yourname/api-gateway:latest'
                    sh 'docker push yourname/auth-service:latest'
                    sh 'docker push yourname/ledger-service:latest'
                    sh 'docker push yourname/fraud-engine:latest'
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    echo '☸️ Deploying to K8s...'
                    // Apply the manifests we created in Phase 4
                    sh 'kubectl apply -f k8s/rabbitmq.yaml'
                    sh 'kubectl apply -f k8s/auth-service.yaml'
                    sh 'kubectl apply -f k8s/ledger-service.yaml'
                    sh 'kubectl apply -f k8s/fraud-engine.yaml'
                    sh 'kubectl apply -f k8s/api-gateway.yaml'
                    
                    // Apply Auto-Scaling Policies
                    sh 'kubectl apply -f k8s/hpa.yaml'
                    
                    // Apply Observability Stack (ELK)
                    sh 'kubectl apply -f k8s/elk.yaml'
                }
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline Succeeded! SafeLedger is live.'
        }
        failure {
            echo '❌ Pipeline Failed. Check logs.'
        }
    }
}