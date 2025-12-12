// pipeline {
//     agent any

//     environment {
//         // Fallback to Standard Jenkins Credentials
//         // Ensure you have a "Username with password" credential named 'dockerhub-login' in Jenkins
//         DOCKER_CREDS = credentials('dockerhub-login')
//     }

//     stages {
//         stage('Setup Tools') {
//             steps {
//                 script {
//                     echo '🔧 Installing Tools (Docker, Kubectl, Node.js)...'
//                     sh 'apt-get update && apt-get install -y docker.io nodejs npm'
//                     // Hardcoded version to prevent curl errors
//                     sh 'curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl"'
//                     sh 'chmod +x kubectl && mv kubectl /usr/local/bin/'
//                 }
//             }
//         }

//         stage('Checkout') {
//             steps {
//                 checkout scm
//             }
//         }

//         stage('Test') {
//              steps {
//                  script {
//                      echo '🧪 Running Tests...'
//                      dir('ledger-service') {
//                          sh 'npm install'
//                          sh 'chmod +x node_modules/.bin/jest'
//                          sh 'npm test'
//                      }
//                  }
//              }
//         }

//         stage('Build Docker Images') {
//             steps {
//                 script {
//                     echo '🔨 Building Docker Images...'
//                     // Use the username from the Jenkins Credential variable
//                     def user = env.DOCKER_CREDS_USR
                    
//                     parallel(
//                         'Gateway': { sh "docker build -t ${user}/api-gateway:latest ./api-gateway" },
//                         'Auth': { sh "docker build -t ${user}/auth-service:latest ./auth-service" },
//                         'Ledger': { sh "docker build -t ${user}/ledger-service:latest ./ledger-service" },
//                         'Fraud': { sh "docker build -t ${user}/fraud-engine:latest ./fraud-engine" }
//                     )
//                 }
//             }
//         }

//         stage('Push to Registry') {
//             steps {
//                 script {
//                     echo '🚀 Pushing to Docker Hub...'
//                     def user = env.DOCKER_CREDS_USR
                    
//                     // Log in using the standard Jenkins credential variables
//                     sh 'echo $DOCKER_CREDS_PSW | docker login -u $DOCKER_CREDS_USR --password-stdin'
                    
//                     sh "docker push ${user}/api-gateway:latest"
//                     sh "docker push ${user}/auth-service:latest"
//                     sh "docker push ${user}/ledger-service:latest"
//                     sh "docker push ${user}/fraud-engine:latest"
//                 }
//             }
//         }

//         stage('Deploy to Kubernetes') {
//             steps {
//                 script {
//                     echo '☸️ Deploying to K8s...'
                    
//                     // Apply infrastructure
//                     sh 'kubectl apply -f k8s/rabbitmq.yaml'
//                     sh 'kubectl apply -f k8s/auth-service.yaml'
//                     sh 'kubectl apply -f k8s/ledger-service.yaml'
//                     sh 'kubectl apply -f k8s/fraud-engine.yaml'
//                     sh 'kubectl apply -f k8s/api-gateway.yaml'
                    
//                     // Apply monitoring & scaling
//                     sh 'kubectl apply -f k8s/elk.yaml'
//                     sh 'kubectl apply -f k8s/hpa.yaml'
                    
//                     // Restart to pull new images
//                     sh 'kubectl rollout restart deployment/api-gateway'
//                     sh 'kubectl rollout restart deployment/auth-service'
//                     sh 'kubectl rollout restart deployment/ledger-service'
//                     sh 'kubectl rollout restart deployment/fraud-engine'
//                 }
//             }
//         }
//     }

//     post {
//         success {
//             echo '✅ Pipeline Succeeded! SafeLedger is live.'
//         }
//         failure {
//             echo '❌ Pipeline Failed. Check logs.'
//         }
//     }
// }

pipeline {
    agent any

    environment {
        // Fallback to Standard Jenkins Credentials
        // Ensure you have a "Username with password" credential named 'dockerhub-login' in Jenkins
        DOCKER_CREDS = credentials('dockerhub-login')
    }

    stages {
        stage('Setup Tools') {
            steps {
                script {
                    echo '🔧 Installing Tools (Docker, Kubectl, Node.js, Python)...'
                    
                    // FIX: Added python3-full and python3-pip to support the Fraud Engine tests
                    // We use --break-system-packages for pip later because we are in a container/CI environment
                    sh 'apt-get update && apt-get install -y docker.io nodejs npm python3-full python3-pip'
                    
                    // Install Kubectl (Hardcoded version)
                    sh 'curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl"'
                    sh 'chmod +x kubectl && mv kubectl /usr/local/bin/'
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Test') {
             steps {
                 script {
                     echo '🧪 Running Automated Tests...'
                     // Parallel testing saves time!
                     parallel(
                        'Ledger Service (Node.js)': {
                             dir('ledger-service') {
                                 sh 'npm install'
                                 sh 'chmod +x node_modules/.bin/jest'
                                 sh 'npm test'
                             }
                        },
                        'Fraud Engine (Python)': {
                             dir('fraud-engine') {
                                 // Install dependencies including numpy
                                 // --break-system-packages is required in recent Debian/Jenkins containers
                                 sh 'pip3 install -r requirements.txt --break-system-packages'
                                 
                                 // Run the new test suite
                                 sh 'python3 -m unittest test_fraud.py'
                             }
                        }
                     )
                 }
             }
        }

        stage('Build Docker Images') {
            steps {
                script {
                    echo '🔨 Building Docker Images...'
                    // Use the username from the Jenkins Credential variable
                    def user = env.DOCKER_CREDS_USR
                    
                    parallel(
                        'Gateway': { sh "docker build -t ${user}/api-gateway:latest ./api-gateway" },
                        'Auth': { sh "docker build -t ${user}/auth-service:latest ./auth-service" },
                        'Ledger': { sh "docker build -t ${user}/ledger-service:latest ./ledger-service" },
                        'Fraud': { sh "docker build -t ${user}/fraud-engine:latest ./fraud-engine" }
                    )
                }
            }
        }

        stage('Push to Registry') {
            steps {
                script {
                    echo '🚀 Pushing to Docker Hub...'
                    def user = env.DOCKER_CREDS_USR
                    
                    // Log in using the standard Jenkins credential variables
                    sh 'echo $DOCKER_CREDS_PSW | docker login -u $DOCKER_CREDS_USR --password-stdin'
                    
                    sh "docker push ${user}/api-gateway:latest"
                    sh "docker push ${user}/auth-service:latest"
                    sh "docker push ${user}/ledger-service:latest"
                    sh "docker push ${user}/fraud-engine:latest"
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    echo '☸️ Deploying to K8s...'
                    
                    // Apply infrastructure
                    sh 'kubectl apply -f k8s/rabbitmq.yaml'
                    sh 'kubectl apply -f k8s/auth-service.yaml'
                    sh 'kubectl apply -f k8s/ledger-service.yaml'
                    sh 'kubectl apply -f k8s/fraud-engine.yaml'
                    sh 'kubectl apply -f k8s/api-gateway.yaml'
                    
                    // Apply monitoring & scaling
                    sh 'kubectl apply -f k8s/elk.yaml'
                    sh 'kubectl apply -f k8s/hpa.yaml'
                    
                    // Restart to pull new images
                    sh 'kubectl rollout restart deployment/api-gateway'
                    sh 'kubectl rollout restart deployment/auth-service'
                    sh 'kubectl rollout restart deployment/ledger-service'
                    sh 'kubectl rollout restart deployment/fraud-engine'
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