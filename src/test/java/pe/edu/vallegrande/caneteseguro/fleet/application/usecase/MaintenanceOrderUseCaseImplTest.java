package pe.edu.vallegrande.caneteseguro.fleet.application.usecase;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CreateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.TechnicalDischargeRequest;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.out.MaintenanceOrderRepositoryPort;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.out.ResourceClientPort;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.MaintenanceType;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderPriority;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderStatus;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MaintenanceOrderUseCaseImplTest {

    @Mock
    private MaintenanceOrderRepositoryPort repositoryPort;

    @Mock
    private ResourceClientPort resourceClientPort;

    @InjectMocks
    private MaintenanceOrderUseCaseImpl useCase;

    private CreateMaintenanceOrderRequest createRequest;

    @BeforeEach
    void setUp() {
        createRequest = CreateMaintenanceOrderRequest.builder()
                .resourceId("rec-001")
                .resourcePlate("POL-100")
                .entityId("ent-policia")
                .maintenanceType(MaintenanceType.CORRECTIVO_ACCIDENTE)
                .priority(OrderPriority.ALTA)
                .failureReason("Choque lateral durante intervención")
                .reportedMileage(35000)
                .build();
    }

    @Test
    @DisplayName("Should create order and trigger resource disabling in vg-ms-recursos via outbound port")
    void shouldCreateOrderSuccessfully() {
        when(repositoryPort.existsByResourceIdAndOrderStatusNotIn(eq("rec-001"), anyCollection()))
                .thenReturn(Mono.just(false));

        when(resourceClientPort.disableResourceForMaintenance(eq("rec-001"), anyString()))
                .thenReturn(Mono.empty());

        when(repositoryPort.save(any(MaintenanceOrder.class)))
                .thenAnswer(inv -> Mono.just(inv.getArgument(0)));

        StepVerifier.create(useCase.create(createRequest, "mock-token", "12345678"))
                .expectNextMatches(resp -> resp.getResourceId().equals("rec-001")
                        && resp.getOrderStatus() == OrderStatus.REGISTRADA
                        && resp.getOrderCode().startsWith("ORD-"))
                .verifyComplete();

        verify(resourceClientPort, times(1)).disableResourceForMaintenance(eq("rec-001"), eq("mock-token"));
    }

    @Test
    @DisplayName("Should issue technical discharge and restore resource to DISPONIBLE via outbound port")
    void shouldIssueTechnicalDischargeSuccessfully() {
        MaintenanceOrder existingOrder = MaintenanceOrder.create(
                "ORD-2026-TEST",
                "rec-001",
                "POL-100",
                "ent-policia",
                "12345678",
                null,
                MaintenanceType.CORRECTIVO,
                OrderPriority.ALTA,
                "Falla de embrague",
                35000,
                null
        );
        existingOrder.setId("orden-mongo-001");
        existingOrder.setOrderStatus(OrderStatus.EN_TALLER);

        when(repositoryPort.findById("orden-mongo-001"))
                .thenReturn(Mono.just(existingOrder));

        when(resourceClientPort.enableResourceToAvailable(eq("rec-001"), anyString()))
                .thenReturn(Mono.empty());

        when(repositoryPort.save(any(MaintenanceOrder.class)))
                .thenAnswer(inv -> Mono.just(inv.getArgument(0)));

        TechnicalDischargeRequest dischargeRequest = TechnicalDischargeRequest.builder()
                .technicalVerdict("Mantenimiento concluido con éxito, embrague calibrado")
                .testsPerformed("Prueba de frenos y cambios en ruta")
                .exitMileage(35015)
                .finalCost(new BigDecimal("950.00"))
                .mediaUrl("https://res.cloudinary.com/vallegrande/image/upload/v1234/acta-prueba.pdf")
                .build();

        StepVerifier.create(useCase.issueTechnicalDischarge("orden-mongo-001", dischargeRequest, "mock-token", "87654321"))
                .expectNextMatches(resp -> resp.getOrderStatus() == OrderStatus.FINALIZADA
                        && resp.getTechnicalDischargeReport() != null
                        && resp.getTechnicalDischargeReport().getExitMileage() == 35015)
                .verifyComplete();

        verify(resourceClientPort, times(1)).enableResourceToAvailable(eq("rec-001"), eq("mock-token"));
    }
}
