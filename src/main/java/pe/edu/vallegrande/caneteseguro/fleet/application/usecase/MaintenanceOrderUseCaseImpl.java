package pe.edu.vallegrande.caneteseguro.fleet.application.usecase;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.AssignWorkshopRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CancelOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CreateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.TechnicalDischargeRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.UpdateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.domain.exception.DomainException;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.TechnicalDischargeReport;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.WorkshopDetail;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.in.MaintenanceOrderUseCase;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.out.MaintenanceOrderRepositoryPort;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.out.ResourceClientPort;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderStatus;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Implementation of fleet maintenance lifecycle use cases.
 * 100% in English according to DatabaseStorage and Hexagonal standards.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MaintenanceOrderUseCaseImpl implements MaintenanceOrderUseCase {

    private static final List<String> TERMINAL_STATUSES = List.of(
            OrderStatus.FINALIZADA.name(),
            OrderStatus.CANCELADA.name()
    );

    private final MaintenanceOrderRepositoryPort repositoryPort;
    private final ResourceClientPort resourceClientPort;

    @Override
    public Flux<MaintenanceOrder> findAll() {
        return repositoryPort.findAll();
    }

    @Override
    public Mono<MaintenanceOrder> findById(String id) {
        return repositoryPort.findById(id)
                .switchIfEmpty(Mono.error(new DomainException("Maintenance order not found with ID: " + id)));
    }

    @Override
    public Mono<MaintenanceOrder> findByCode(String code) {
        return repositoryPort.findByOrderCode(code)
                .switchIfEmpty(Mono.error(new DomainException("Maintenance order not found with code: " + code)));
    }

    @Override
    public Flux<MaintenanceOrder> findByResource(String resourceId) {
        return repositoryPort.findByResourceId(resourceId);
    }

    @Override
    public Flux<MaintenanceOrder> findByEntity(String entityId) {
        return repositoryPort.findByEntityId(entityId);
    }

    @Override
    public Flux<MaintenanceOrder> findByStatus(OrderStatus status) {
        return repositoryPort.findByOrderStatus(status.name());
    }

    @Override
    public Mono<MaintenanceOrder> create(CreateMaintenanceOrderRequest request, String token, String reportedByDni) {
        log.info("Initiating creation of maintenance order for resource: {}", request.getResourceId());

        return repositoryPort.existsByResourceIdAndOrderStatusNotIn(request.getResourceId(), TERMINAL_STATUSES)
                .flatMap(existsActive -> {
                    if (Boolean.TRUE.equals(existsActive)) {
                        return Mono.error(new DomainException(
                                "Operational resource " + request.getResourceId() + " already has an active maintenance order"
                        ));
                    }

                    String year = String.valueOf(LocalDateTime.now().getYear());
                    String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
                    String orderCode = "ORD-" + year + "-" + suffix;

                    MaintenanceOrder newOrder = MaintenanceOrder.create(
                            orderCode,
                            request.getResourceId(),
                            request.getResourcePlate(),
                            request.getEntityId(),
                            reportedByDni,
                            request.getIncidentId(),
                            request.getMaintenanceType(),
                            request.getPriority(),
                            request.getFailureReason(),
                            request.getReportedMileage(),
                            request.getRemarks()
                    );

                    return resourceClientPort.disableResourceForMaintenance(request.getResourceId(), token)
                            .onErrorResume(err -> {
                                log.warn("Notice: Could not communicate directly with vg-ms-recursos ({}), order will be saved locally.", err.getMessage());
                                return Mono.empty();
                            })
                            .then(repositoryPort.save(newOrder));
                });
    }

    @Override
    public Mono<MaintenanceOrder> update(String id, UpdateMaintenanceOrderRequest request) {
        log.info("Updating editable header and workshop fields for maintenance order: {}", id);
        return findById(id)
                .flatMap(order -> {
                    WorkshopDetail workshop = null;
                    if (request.getWorkshopDetail() != null) {
                        workshop = WorkshopDetail.builder()
                                .workshopName(request.getWorkshopDetail().getWorkshopName())
                                .workshopRuc(request.getWorkshopDetail().getWorkshopRuc())
                                .mechanicInCharge(request.getWorkshopDetail().getMechanicInCharge())
                                .contactPhone(request.getWorkshopDetail().getContactPhone())
                                .workshopAddress(request.getWorkshopDetail().getWorkshopAddress())
                                .estimatedCost(request.getWorkshopDetail().getEstimatedCost())
                                .estimatedDeliveryDate(request.getWorkshopDetail().getEstimatedDeliveryDate())
                                .initialDiagnosis(request.getWorkshopDetail().getInitialDiagnosis())
                                .build();
                    }
                    order.updateDetails(
                            request.getFailureReason(),
                            request.getReportedMileage(),
                            request.getPriority(),
                            request.getRemarks(),
                            request.getIncidentId(),
                            workshop
                    );
                    return repositoryPort.save(order);
                });
    }

    @Override
    public Mono<MaintenanceOrder> assignWorkshop(String id, AssignWorkshopRequest request) {
        return findById(id)
                .flatMap(order -> {
                    WorkshopDetail workshop = WorkshopDetail.builder()
                            .workshopName(request.getWorkshopName())
                            .workshopRuc(request.getWorkshopRuc())
                            .mechanicInCharge(request.getMechanicInCharge())
                            .contactPhone(request.getContactPhone())
                            .workshopAddress(request.getWorkshopAddress())
                            .estimatedCost(request.getEstimatedCost())
                            .estimatedDeliveryDate(request.getEstimatedDeliveryDate())
                            .initialDiagnosis(request.getInitialDiagnosis())
                            .build();

                    order.assignWorkshop(workshop);
                    return repositoryPort.save(order);
                });
    }

    @Override
    public Mono<MaintenanceOrder> startRepair(String id) {
        return findById(id)
                .flatMap(order -> {
                    order.startRepair();
                    return repositoryPort.save(order);
                });
    }

    @Override
    public Mono<MaintenanceOrder> passToQualityControl(String id) {
        return findById(id)
                .flatMap(order -> {
                    order.passToQualityControl();
                    return repositoryPort.save(order);
                });
    }

    @Override
    public Mono<MaintenanceOrder> issueTechnicalDischarge(String id, TechnicalDischargeRequest request, String token, String approvedByDni) {
        log.info("Issuing technical discharge for order: {}", id);

        return findById(id)
                .flatMap(order -> {
                    TechnicalDischargeReport report = TechnicalDischargeReport.builder()
                            .technicalVerdict(request.getTechnicalVerdict())
                            .testsPerformed(request.getTestsPerformed())
                            .exitMileage(request.getExitMileage())
                            .dischargeDate(LocalDateTime.now())
                            .approvedByDni(approvedByDni)
                            .remarks(request.getRemarks())
                            .mediaUrl(request.getMediaUrl())
                            .build();

                    if (request.getFinalCost() != null && order.getWorkshopDetail() != null) {
                        order.getWorkshopDetail().setFinalCost(request.getFinalCost());
                    }

                    order.issueTechnicalDischarge(report);

                    return resourceClientPort.enableResourceToAvailable(order.getResourceId(), token)
                            .onErrorResume(err -> {
                                log.warn("Notice: Could not communicate directly with vg-ms-recursos ({}), order completed locally.", err.getMessage());
                                return Mono.empty();
                            })
                            .then(repositoryPort.save(order));
                });
    }

    @Override
    public Mono<MaintenanceOrder> cancel(String id, CancelOrderRequest request, String token) {
        return findById(id)
                .flatMap(order -> {
                    order.cancel(request.getReason());

                    return resourceClientPort.enableResourceToAvailable(order.getResourceId(), token)
                            .onErrorResume(err -> {
                                log.warn("Notice: Could not rehabilitate resource on cancel: {}", err.getMessage());
                                return Mono.empty();
                            })
                            .then(repositoryPort.save(order));
                });
    }
}
