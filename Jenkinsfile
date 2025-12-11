pipeline {
    agent any

    // Environment block removed: We now fetch secrets dynamically from Vault for higher security

    stages {
        stage('Setup Tools') {
            steps {
                script {
                    echo '🔧 Installing Tools (Docker, Kubectl, Node.js)...'
                    // 1. Install Docker CLI and Node.js/NPM (using apt-get since we run as root)
                    sh 'apt-get update && apt-get install -y docker.io nodejs npm'
                    
                    // 2. Install Kubectl
                    sh 'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"'
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
                     echo '🧪 Running Tests...'
                     // Only running Ledger tests for now
                     dir('ledger-service') {
                         sh 'npm install'
                         // Fix permission issue where jest binary is not executable
                         sh 'chmod +x node_modules/.bin/jest'
                         sh 'npm test'
                     }
                 }
             }
        }

        stage('Build Docker Images') {
            steps {
                // Secure Storage: Fetching credentials from Vault
                // Note: Requires "HashiCorp Vault" plugin and a running Vault instance
                withVault(configuration: [vaultUrl: 'http://vault.default:8200', vaultCredentialId: 'jenkins-vault-role', engineVersion: 2], 
                          vaultSecrets: [[path: 'secret/data/safeledger', secretValues: [
                              [envVar: 'DOCKERHUB_USR', vaultKey: 'username']]]]) {
                    script {
                        echo '🔨 Building Docker Images...'
                        // Use the Username fetched from Vault
                        def user = env.DOCKERHUB_USR
                        
                        parallel(
                            'Gateway': { sh "docker build -t ${user}/api-gateway:latest ./api-gateway" },
                            'Auth': { sh "docker build -t ${user}/auth-service:latest ./auth-service" },
                            'Ledger': { sh "docker build -t ${user}/ledger-service:latest ./ledger-service" },
                            'Fraud': { sh "docker build -t ${user}/fraud-engine:latest ./fraud-engine" }
                        )
                    }
                }
            }
        }

        stage('Push to Registry') {
            steps {
                // Secure Storage: Fetching full credentials (User + Password) from Vault
                withVault(configuration: [vaultUrl: 'http://vault.default:8200', vaultCredentialId: 'jenkins-vault-role', engineVersion: 2], 
                          vaultSecrets: [[path: 'secret/data/safeledger', secretValues: [
                              [envVar: 'DOCKERHUB_USR', vaultKey: 'username'],
                              [envVar: 'DOCKERHUB_PSW', vaultKey: 'password']]]]) {
                    script {
                        echo '🚀 Pushing to Docker Hub...'
                        def user = env.DOCKERHUB_USR
                        
                        // Log in using the Env Variables injected by Vault
                        sh 'echo $DOCKERHUB_PSW | docker login -u $DOCKERHUB_USR --password-stdin'
                        
                        sh "docker push ${user}/api-gateway:latest"
                        sh "docker push ${user}/auth-service:latest"
                        sh "docker push ${user}/ledger-service:latest"
                        sh "docker push ${user}/fraud-engine:latest"
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    echo '☸️ Deploying to K8s...'
                    // We don't need a kubeconfig file because Jenkins is running INSIDE the cluster!
                    
                    sh 'kubectl apply -f k8s/rabbitmq.yaml'
                    sh 'kubectl apply -f k8s/auth-service.yaml'
                    sh 'kubectl apply -f k8s/ledger-service.yaml'
                    sh 'kubectl apply -f k8s/fraud-engine.yaml'
                    sh 'kubectl apply -f k8s/api-gateway.yaml'
                    
                    // Deploy Observability Stack (ELK) & Autoscaling
                    sh 'kubectl apply -f k8s/elk.yaml'
                    sh 'kubectl apply -f k8s/hpa.yaml'
                    
                    // Optional: Force a restart to pick up the new images immediately
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

// pipeline {
//     agent any

//     environment {
//         // This pulls your username/password from the "dockerhub-login" credential you created
//         DOCKERHUB_CREDENTIALS = credentials('dockerhub-login')
//     }

//     stages {
//         stage('Setup Tools') {
//             steps {
//                 script {
//                     echo '🔧 Installing Tools (Docker, Kubectl, Node.js)...'
//                     // 1. Install Docker CLI and Node.js/NPM (using apt-get since we run as root)
//                     sh 'apt-get update && apt-get install -y docker.io nodejs npm'
                    
//                     // 2. Install Kubectl
//                     sh 'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"'
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
//                      // Only running Ledger tests for now
//                      dir('ledger-service') {
//                          sh 'npm install'
//                          // Fix permission issue where jest binary is not executable
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
//                     // Use the Docker Hub Username from credentials for the image tag
//                     def user = env.DOCKERHUB_CREDENTIALS_USR
                    
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
//                     def user = env.DOCKERHUB_CREDENTIALS_USR
                    
//                     // Log in using the Env Variables provided by the credentials plugin
//                     sh 'echo $DOCKERHUB_CREDENTIALS_PSW | docker login -u $DOCKERHUB_CREDENTIALS_USR --password-stdin'
                    
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
//                     // We don't need a kubeconfig file because Jenkins is running INSIDE the cluster!
                    
//                     sh 'kubectl apply -f k8s/rabbitmq.yaml'
//                     sh 'kubectl apply -f k8s/auth-service.yaml'
//                     sh 'kubectl apply -f k8s/ledger-service.yaml'
//                     sh 'kubectl apply -f k8s/fraud-engine.yaml'
//                     sh 'kubectl apply -f k8s/api-gateway.yaml'
                    
//                     // Deploy Observability Stack (ELK) & Autoscaling
//                     sh 'kubectl apply -f k8s/elk.yaml'
//                     sh 'kubectl apply -f k8s/hpa.yaml'
                    
//                     // Optional: Force a restart to pick up the new images immediately
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