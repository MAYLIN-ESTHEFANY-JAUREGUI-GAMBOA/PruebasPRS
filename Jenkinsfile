pipeline {
    agent any

    environment {
        SONARQUBE_SERVER = 'SonarQube'
        SLACK_CHANNEL = '#prs-ci'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Obteniendo el código desde GitLab...'
                checkout scm
            }
        }

        stage('Build') {
            steps {
                echo 'Compilando el proyecto...'

                script {
                    if (isUnix()) {
                        sh 'chmod +x mvnw'
                        sh './mvnw --batch-mode clean package -DskipTests'
                    } else {
                        bat 'mvnw.cmd --batch-mode clean package -DskipTests'
                    }
                }
            }
        }

        stage('Unit Tests') {
            steps {
                echo 'Ejecutando pruebas unitarias...'

                script {
                    if (isUnix()) {
                        sh './mvnw --batch-mode test'
                    } else {
                        bat 'mvnw.cmd --batch-mode test'
                    }
                }
            }

            post {
                always {
                    junit(
                        allowEmptyResults: true,
                        testResults: 'target/surefire-reports/*.xml'
                    )
                }
            }
        }

        stage('SonarQube analysis') {
            steps {
                echo 'Analizando la calidad del código con SonarQube...'

                withSonarQubeEnv("${SONARQUBE_SERVER}") {
                    script {
                        if (isUnix()) {
                            sh './mvnw --batch-mode org.sonarsource.scanner.maven:sonar-maven-plugin:5.1.0.4751:sonar'
                        } else {
                            bat 'mvnw.cmd --batch-mode org.sonarsource.scanner.maven:sonar-maven-plugin:5.1.0.4751:sonar'
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'Pipeline ejecutado correctamente.'

            slackSend(
                channel: "${SLACK_CHANNEL}",
                color: 'good',
                message: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER} - ${env.BUILD_URL}"
            )
        }

        failure {
            echo 'El pipeline presentó errores.'

            slackSend(
                channel: "${SLACK_CHANNEL}",
                color: 'danger',
                message: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER} - ${env.BUILD_URL}"
            )
        }

        always {
            echo "Finalizó el build #${env.BUILD_NUMBER}"
        }
    }
}