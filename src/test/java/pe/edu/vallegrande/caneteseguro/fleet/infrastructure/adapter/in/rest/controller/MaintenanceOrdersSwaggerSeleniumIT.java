package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.in.rest.controller;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MaintenanceOrdersSwaggerSeleniumIT {

    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeEach
    void openSwaggerUi() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage");
        driver = new ChromeDriver(options);
        wait = new WebDriverWait(driver, Duration.ofSeconds(20));

        String baseUrl = System.getProperty(
                "selenium.baseUrl",
                System.getenv().getOrDefault("SELENIUM_BASE_URL", "http://localhost:9012"));
        driver.get(baseUrl + "/swagger-ui.html");
    }

    @AfterEach
    void closeBrowser() {
        if (driver != null) {
            driver.quit();
        }
    }

    @Test
    void shouldLoadSwaggerUiDocumentation() {
        wait.until(webDriver -> webDriver.findElement(By.cssSelector(".swagger-ui")).isDisplayed());

        assertTrue(driver.getTitle().contains("Swagger UI"));
    }

    @Test
    void shouldExposeOrderEndpoints() {
        wait.until(webDriver -> webDriver.findElement(By.cssSelector(".swagger-ui")).isDisplayed());
        wait.until(webDriver -> webDriver.findElement(By.tagName("body"))
                .getText().contains("/api/v1/maintenance-orders"));

        assertTrue(driver.findElement(By.tagName("body")).getText()
                .contains("Maintenance Orders"));
    }
}
